import express from 'express';
import { createServer as createViteServer } from 'vite';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Browser singleton manager
let browserInstance: Browser | null = null;
let activeContext: BrowserContext | null = null;
let activePage: Page | null = null;

interface CapturedLog {
  id: string;
  type: string;
  text: string;
  location?: string;
  timestamp: number;
}

interface CapturedRequest {
  id: string;
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  statusText?: string;
  size?: number;
  duration?: number;
  startTime: number;
  endTime?: number;
  contentType?: string;
}

let activeConsoleLogs: CapturedLog[] = [];
let activeNetworkRequests: CapturedRequest[] = [];
let currentSessionUrl = '';

// Dynamically locate valid chromium / chrome-headless-shell binary
function getChromiumExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  // Ensure symlink exists if container image has revision 1247
  try {
    if (fs.existsSync('/ms-playwright/chromium_headless_shell-1247') && !fs.existsSync('/ms-playwright/chromium_headless_shell-1254')) {
      fs.symlinkSync('/ms-playwright/chromium_headless_shell-1247', '/ms-playwright/chromium_headless_shell-1254');
    }
  } catch { /* ignore */ }

  const candidates = [
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium-1254/chrome-linux/chrome',
    '/ms-playwright/chromium-1247/chrome-linux/chrome',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Scan /ms-playwright directory for any chrome-headless-shell or chrome
  if (fs.existsSync('/ms-playwright')) {
    try {
      const dirs = fs.readdirSync('/ms-playwright');
      for (const d of dirs) {
        const fullDir = path.join('/ms-playwright', d);
        const sub1 = path.join(fullDir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
        if (fs.existsSync(sub1)) return sub1;
        const sub2 = path.join(fullDir, 'chrome-linux', 'chrome');
        if (fs.existsSync(sub2)) return sub2;
        const sub3 = path.join(fullDir, 'chrome');
        if (fs.existsSync(sub3)) return sub3;
      }
    } catch { /* ignore */ }
  }

  return undefined;
}

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    const execPath = getChromiumExecutablePath();
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--ignore-certificate-errors',
      ],
    };

    if (execPath) {
      launchOptions.executablePath = execPath;
    }

    browserInstance = await chromium.launch(launchOptions);
  }
  return browserInstance;
}

function normalizeUrl(inputUrl: string): string {
  let url = inputUrl.trim();
  if (!url) return 'https://example.com';
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

// Fallback image cache to prevent blank screens during transient frame swaps
let lastSuccessfulScreenshot = '';

// Resilient screenshot helper that handles navigation transitions and protocol errors
async function safeScreenshot(page: Page | null, options: any = { type: 'jpeg', quality: 75 }): Promise<string> {
  if (!page || page.isClosed()) {
    return lastSuccessfulScreenshot;
  }

  // Settle in-flight navigations if any
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 1500 }).catch(() => {});
  } catch { /* ignore */ }

  // Attempt 1: Standard screenshot
  try {
    const buffer = await page.screenshot(options);
    const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    lastSuccessfulScreenshot = base64;
    return base64;
  } catch {
    // Attempt 2: Wait 150ms for frame transition to settle and retry without fullPage
    try {
      await page.waitForTimeout(150).catch(() => {});
      const fallbackOptions = { ...options, fullPage: false };
      const buffer = await page.screenshot(fallbackOptions);
      const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      lastSuccessfulScreenshot = base64;
      return base64;
    } catch {
      // Fall back to last successful screenshot
      return lastSuccessfulScreenshot;
    }
  }
}

// API: Health & Status
app.get('/api/health', async (_req, res) => {
  try {
    const browser = await getBrowser();
    res.json({
      status: 'ok',
      connected: browser.isConnected(),
      activeUrl: currentSessionUrl || null,
      memoryUsage: process.memoryUsage(),
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// API: Navigate to URL
app.post('/api/playwright/navigate', async (req, res) => {
  const startTime = Date.now();
  const {
    url: rawUrl,
    viewport = { width: 1280, height: 800 },
    isMobile = false,
    colorScheme = 'dark',
    fullPage = false,
    userAgent,
    bypassCSP = true,
    timeoutMs = 30000,
  } = req.body;

  const targetUrl = normalizeUrl(rawUrl);
  currentSessionUrl = targetUrl;
  activeConsoleLogs = [];
  activeNetworkRequests = [];

  try {
    const browser = await getBrowser();

    // Close existing context to keep sessions clean & prevent leaks
    if (activePage) {
      try { await activePage.close(); } catch { /* ignore */ }
    }
    if (activeContext) {
      try { await activeContext.close(); } catch { /* ignore */ }
    }

    const contextOptions: any = {
      viewport: { width: Number(viewport.width) || 1280, height: Number(viewport.height) || 800 },
      isMobile: Boolean(isMobile),
      colorScheme: colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'no-preference',
      bypassCSP: Boolean(bypassCSP),
      ignoreHTTPSErrors: true,
      locale: 'en-US',
      timezoneId: 'America/New_York',
    };

    if (userAgent && typeof userAgent === 'string' && userAgent.trim().length > 0) {
      contextOptions.userAgent = userAgent;
    } else {
      contextOptions.userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PlaywrightStudio/1.0';
    }

    activeContext = await browser.newContext(contextOptions);
    activePage = await activeContext.newPage();

    // Attach Network Listeners
    const requestMap = new Map<string, CapturedRequest>();

    activePage.on('request', (request) => {
      const id = 'req_' + Math.random().toString(36).substring(2, 9);
      const reqData: CapturedRequest = {
        id,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        startTime: Date.now(),
      };
      requestMap.set(request.url(), reqData);
      activeNetworkRequests.unshift(reqData);
      if (activeNetworkRequests.length > 200) activeNetworkRequests.pop();
    });

    activePage.on('response', async (response) => {
      const match = requestMap.get(response.url());
      if (match) {
        match.status = response.status();
        match.statusText = response.statusText();
        match.endTime = Date.now();
        match.duration = match.endTime - match.startTime;
        try {
          const headers = response.headers();
          match.contentType = headers['content-type'] || '';
          const contentLength = headers['content-length'];
          if (contentLength) match.size = parseInt(contentLength, 10);
        } catch { /* ignore */ }
      }
    });

    // Attach Console Listeners
    activePage.on('console', (msg) => {
      const logItem: CapturedLog = {
        id: 'log_' + Math.random().toString(36).substring(2, 9),
        type: msg.type(),
        text: msg.text(),
        location: msg.location().url ? `${msg.location().url}:${msg.location().lineNumber}` : undefined,
        timestamp: Date.now(),
      };
      activeConsoleLogs.push(logItem);
      if (activeConsoleLogs.length > 250) activeConsoleLogs.shift();
    });

    activePage.on('pageerror', (err) => {
      activeConsoleLogs.push({
        id: 'err_' + Math.random().toString(36).substring(2, 9),
        type: 'error',
        text: err.message || String(err),
        timestamp: Date.now(),
      });
    });

    // Navigate with smart fallback
    let response;
    try {
      response = await activePage.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(timeoutMs, 25000),
      });
    } catch (navError: any) {
      console.warn('Navigation domcontentloaded timeout, attempting fallback to current state...', navError.message);
    }

    // Brief stabilization wait for fonts/animations (fast 150ms)
    await activePage.waitForTimeout(150).catch(() => {});

    // Page metadata
    const title = await activePage.title().catch(() => '');
    const finalUrl = activePage.url();
    const httpStatus = response ? response.status() : 200;
    const httpStatusText = response ? response.statusText() : 'OK';

    // Capture Viewport / Full screenshot via safeScreenshot
    const screenshotBase64 = await safeScreenshot(activePage, {
      type: 'jpeg',
      quality: 75,
      fullPage: Boolean(fullPage),
    });

    // Extract interactive elements & metadata from DOM via string literal to avoid esbuild __name injection
    const extractedData: any = await activePage.evaluate(`
      (() => {
        const getMeta = function(nameOrProp) {
          const el = document.querySelector('meta[name="' + nameOrProp + '"], meta[property="' + nameOrProp + '"]');
          return el ? el.getAttribute('content') : null;
        };

        const meta = {
          description: getMeta('description') || getMeta('og:description') || '',
          ogTitle: getMeta('og:title') || document.title,
          ogImage: getMeta('og:image') || '',
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
          favicon: document.querySelector('link[rel*="icon"]')?.getAttribute('href') || '/favicon.ico',
        };

        const interactiveElements = [];
        const queryTargets = document.querySelectorAll(
          'button, a, input, select, textarea, h1, h2, h3, nav, form, [role="button"], [onclick]'
        );

        let count = 0;
        for (let i = 0; i < queryTargets.length; i++) {
          if (count >= 120) break;
          const el = queryTargets[i];
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top < 3000) {
            const tag = el.tagName.toLowerCase();
            const id = el.id || '';
            const className = typeof el.className === 'string' ? el.className.slice(0, 80) : '';
            const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);

            let selector = tag;
            if (id) {
              selector = '#' + id;
            } else if (className && className.split(' ')[0]) {
              selector = tag + '.' + className.split(' ')[0];
            }

            interactiveElements.push({
              tag: tag,
              text: text,
              id: id,
              className: className,
              selector: selector,
              href: el.getAttribute('href') || undefined,
              type: el.getAttribute('type') || undefined,
              rect: {
                x: Math.round(rect.left ?? rect.x ?? 0),
                y: Math.round(rect.top ?? rect.y ?? 0),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
            });
            count++;
          }
        }

        const stats = {
          totalElements: document.querySelectorAll('*').length,
          linksCount: document.querySelectorAll('a').length,
          imagesCount: document.querySelectorAll('img').length,
          scriptsCount: document.querySelectorAll('script').length,
          formsCount: document.querySelectorAll('form').length,
          bodyHeight: document.body ? document.body.scrollHeight : 0,
          bodyWidth: document.body ? document.body.scrollWidth : 0,
        };

        const domTree = [];
        const traverse = function(node, depth) {
          if (depth > 4 || domTree.length >= 60) return;
          const children = Array.from(node.children);
          domTree.push({
            tag: node.tagName.toLowerCase(),
            id: node.id || undefined,
            className: typeof node.className === 'string' ? node.className.slice(0, 50) : undefined,
            childCount: children.length,
            depth: depth,
            textSnippet: (node.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
          });
          for (let j = 0; j < Math.min(children.length, 6); j++) {
            traverse(children[j], depth + 1);
          }
        };

        if (document.body) {
          traverse(document.body, 1);
        }

        return { meta: meta, interactiveElements: interactiveElements, stats: stats, domTree: domTree };
      })()
    `).catch((err) => {
      console.warn('DOM evaluate extraction warning:', err.message);
      return {
        meta: { description: '', ogTitle: '', ogImage: '', canonical: '', favicon: '' },
        interactiveElements: [],
        stats: { totalElements: 0, linksCount: 0, imagesCount: 0, scriptsCount: 0, formsCount: 0, bodyHeight: 0, bodyWidth: 0 },
        domTree: [],
      };
    });

    // Cookies
    const cookies = await activeContext.cookies().catch(() => []);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      url: finalUrl,
      title,
      status: httpStatus,
      statusText: httpStatusText,
      durationMs,
      screenshot: screenshotBase64,
      viewport: {
        width: Number(viewport.width) || 1280,
        height: Number(viewport.height) || 800,
        fullPage: Boolean(fullPage),
      },
      meta: extractedData.meta,
      stats: extractedData.stats,
      interactiveElements: extractedData.interactiveElements,
      domTree: extractedData.domTree,
      cookiesCount: cookies.length,
      networkRequests: activeNetworkRequests.slice(0, 100),
      consoleLogs: activeConsoleLogs.slice(0, 100),
    });
  } catch (err: any) {
    console.error('Playwright navigation error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to navigate and render page with Playwright',
      url: targetUrl,
      durationMs: Date.now() - startTime,
    });
  }
});

// API: Perform Interactive Action on Page (Click, Type, Scroll, Evaluate)
// Smart Click Helper with Multi-Strategy Fallback
async function performSmartClick(page: Page, rawSelector: string): Promise<string> {
  const query = rawSelector.trim();
  if (!query) throw new Error('Empty selector provided');

  // Strategy 1: If it's a CSS selector (starts with #, ., [, :, // or starts with standard HTML tag)
  const isLikelyCssOrXpath = /^([.#\[/]|button|a|input|select|textarea|div|span|p|h[1-6]|form|nav|li|ul|ol|table|tr|td|th)\b/i.test(query);

  if (isLikelyCssOrXpath) {
    try {
      await page.click(query, { timeout: 2500 });
      return `Clicked element with selector '${query}'`;
    } catch {
      // Fall through to text/DOM search
    }
  }

  // Strategy 2: Playwright text locator (text="...")
  const cleanText = query.replace(/^text=/i, '').replace(/^['"]|['"]$/g, '');
  try {
    const textLocator = page.locator(`text="${cleanText}"`).first();
    if ((await textLocator.count()) > 0) {
      await textLocator.click({ timeout: 2000 });
      return `Clicked text element "${cleanText}"`;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: Playwright getByText
  try {
    const byText = page.getByText(cleanText, { exact: false }).first();
    if ((await byText.count()) > 0) {
      await byText.click({ timeout: 2000 });
      return `Clicked element with text "${cleanText}"`;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 4: DOM search in page evaluate (finds buttons, links, clickable items with matching text)
  const clickedInDom = await page.evaluate((targetText) => {
    const clean = targetText.toLowerCase().trim();
    const candidates = Array.from(
      document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], [onclick], div, span, p, h1, h2, h3, h4, li')
    );
    const match = candidates.find((el) => {
      const text = (el.textContent || (el as HTMLInputElement).value || '').toLowerCase().trim();
      return text === clean || (clean.length > 2 && text.includes(clean));
    });
    if (match) {
      (match as HTMLElement).click();
      return { found: true, tag: match.tagName.toLowerCase() };
    }
    return { found: false, tag: '' };
  }, query);

  if (clickedInDom.found) {
    return `Clicked <${clickedInDom.tag}> containing "${query}"`;
  }

  // Strategy 5: Raw selector fallback with short timeout
  if (!isLikelyCssOrXpath) {
    try {
      await page.click(query, { timeout: 1500 });
      return `Clicked selector '${query}'`;
    } catch {
      // Fall through
    }
  }

  throw new Error(`Element matching "${query}" was not found or not clickable. Tip: click directly on the live preview canvas, or use a CSS selector (e.g. #id, .class, button).`);
}

// Smart Fill Helper
async function performSmartFill(page: Page, rawSelector: string, value: string): Promise<string> {
  const query = rawSelector.trim();
  if (!query) throw new Error('Empty input selector provided');

  // Try direct fill
  try {
    await page.fill(query, String(value), { timeout: 2500 });
    return `Filled '${query}' with text`;
  } catch {
    // Try placeholder or name matching
    try {
      const byPlaceholder = page.getByPlaceholder(query).first();
      if ((await byPlaceholder.count()) > 0) {
        await byPlaceholder.fill(String(value), { timeout: 2000 });
        return `Filled input with placeholder "${query}"`;
      }
    } catch {
      // Try DOM evaluate fallback
      const filled = await page.evaluate(({ sel, val }) => {
        const clean = sel.toLowerCase();
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
        const target = inputs.find((el) => {
          const ph = (el.getAttribute('placeholder') || '').toLowerCase();
          const name = (el.getAttribute('name') || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          return ph.includes(clean) || name.includes(clean) || id.includes(clean);
        }) as HTMLInputElement | HTMLTextAreaElement | undefined;

        if (target) {
          target.value = val;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, { sel: query, val: value });

      if (filled) return `Filled input matching "${query}"`;
    }
    throw new Error(`Input field matching "${query}" was not found. Try selecting an input from the DOM Elements tab or use "input" or "#id".`);
  }
}

// API: Perform Interactive Action on Page (Click, Type, Scroll, Evaluate)
app.post('/api/playwright/action', async (req, res) => {
  const { action, x, y, selector, value, key, direction = 'down', script } = req.body;

  if (!activePage || activePage.isClosed()) {
    return res.status(400).json({
      success: false,
      message: 'No active browser page session. Please navigate to a URL first.',
    });
  }

  try {
    let actionResult: any = null;

    if (action === 'click') {
      const prevUrl = activePage.url();
      if (typeof x === 'number' && typeof y === 'number') {
        await activePage.mouse.click(x, y);
        actionResult = `Clicked at coordinate (${x}, ${y})`;
      } else if (selector) {
        actionResult = await performSmartClick(activePage, selector);
      } else {
        throw new Error('Either coordinate (x, y) or selector is required for click');
      }

      // If click triggered page navigation, await domcontentloaded smoothly
      await activePage.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {});
      if (activePage.url() !== prevUrl) {
        currentSessionUrl = activePage.url();
      }
    } else if (action === 'fill') {
      if (selector && value !== undefined) {
        actionResult = await performSmartFill(activePage, selector, value);
      } else {
        throw new Error('Selector and value are required to fill an input');
      }
    } else if (action === 'press') {
      if (key) {
        await activePage.keyboard.press(key);
        actionResult = `Pressed key '${key}'`;
      }
    } else if (action === 'scroll') {
      const scrollDir = direction || 'down';
      await activePage.evaluate(`
        (() => {
          const dir = ${JSON.stringify(scrollDir)};
          const delta = dir === 'down' ? 450 : dir === 'up' ? -450 : dir === 'top' ? -999999 : 999999;
          window.scrollBy({ top: delta, behavior: 'instant' });
        })()
      `);
      actionResult = `Scrolled ${scrollDir}`;
    } else if (action === 'evaluate') {
      if (script) {
        actionResult = await activePage.evaluate(`
          (() => {
            return window.eval(${JSON.stringify(script)});
          })()
        `);
      }
    } else if (action === 'screenshot') {
      actionResult = 'Recaptured screenshot';
    }

    // Brief wait for UI to react (fast 60ms)
    await activePage.waitForTimeout(60).catch(() => {});

    // Recapture screenshot safely via safeScreenshot
    const screenshotBase64 = await safeScreenshot(activePage, {
      type: 'jpeg',
      quality: 75,
    });
    const title = await activePage.title().catch(() => '');
    const currentUrl = activePage.url();

    res.json({
      success: true,
      actionResult,
      title,
      url: currentUrl,
      screenshot: screenshotBase64,
      networkRequests: activeNetworkRequests.slice(0, 100),
      consoleLogs: activeConsoleLogs.slice(0, 100),
    });
  } catch (err: any) {
    console.warn('Playwright action handled with warning:', err.message);

    // Safely capture current screenshot or fall back to last successful frame
    const screenshotBase64 = await safeScreenshot(activePage, { type: 'jpeg', quality: 75 });

    res.json({
      success: false,
      message: err.message || 'Action could not be completed on active page',
      title: await activePage.title().catch(() => ''),
      url: activePage.url(),
      screenshot: screenshotBase64 || undefined,
      networkRequests: activeNetworkRequests.slice(0, 100),
    });
  }
});

// Dedicated High-Speed Scroll Endpoint for Mouse Wheel & Keyboard Navigation
app.post('/api/playwright/scroll', async (req, res) => {
  if (!activePage || activePage.isClosed()) {
    return res.status(400).json({ success: false, message: 'No active browser page session.' });
  }

  const { deltaY = 0, direction, targetY } = req.body;

  try {
    const scrollInfo: any = await activePage.evaluate(`
      (() => {
        const delta = ${Number(deltaY) || 0};
        const dir = ${JSON.stringify(direction || '')};
        const target = ${typeof targetY === 'number' ? targetY : 'null'};

        if (target !== null) {
          window.scrollTo({ top: target, behavior: 'instant' });
        } else if (dir === 'top') {
          window.scrollTo({ top: 0, behavior: 'instant' });
        } else if (dir === 'bottom') {
          window.scrollTo({ top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), behavior: 'instant' });
        } else if (dir === 'up') {
          window.scrollBy({ top: -450, behavior: 'instant' });
        } else if (dir === 'down') {
          window.scrollBy({ top: 450, behavior: 'instant' });
        } else if (delta !== 0) {
          window.scrollBy({ top: delta, behavior: 'instant' });
        }

        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1);
        const viewHeight = window.innerHeight || 800;
        const maxScrollY = Math.max(0, docHeight - viewHeight);

        return {
          scrollY: Math.round(scrollY),
          maxScrollY: Math.round(maxScrollY),
          docHeight: Math.round(docHeight),
          viewHeight: Math.round(viewHeight),
        };
      })()
    `);

    // Tiny 25ms yield for layout flush
    await activePage.waitForTimeout(25).catch(() => {});

    // Fast screenshot via safeScreenshot
    const screenshotBase64 = await safeScreenshot(activePage, {
      type: 'jpeg',
      quality: 72,
    });

    res.json({
      success: true,
      screenshot: screenshotBase64,
      scrollY: scrollInfo.scrollY,
      maxScrollY: scrollInfo.maxScrollY,
      docHeight: scrollInfo.docHeight,
      viewHeight: scrollInfo.viewHeight,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Scroll failed' });
  }
});

// API: Run Custom Playwright Automation Script
app.post('/api/playwright/run-script', async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, message: 'Script code is required.' });
  }

  const executionLogs: string[] = [];
  const scriptStartTime = Date.now();

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      executionLogs.push(`[Browser Console ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    executionLogs.push(`[Playwright Engine] Initialized chromium context`);

    // Create an async function runner context
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction('page', 'context', 'browser', 'log', `
      try {
        ${code}
      } catch(err) {
        log('[Script Error] ' + (err.message || String(err)));
        throw err;
      }
    `);

    await runner(page, context, browser, (msg: string) => executionLogs.push(msg));

    const finalTitle = await page.title().catch(() => '');
    const finalUrl = page.url();
    const screenshot = await safeScreenshot(page, { type: 'jpeg', quality: 75 });

    await page.close().catch(() => {});
    await context.close().catch(() => {});

    res.json({
      success: true,
      durationMs: Date.now() - scriptStartTime,
      title: finalTitle,
      url: finalUrl,
      screenshot,
      logs: executionLogs,
    });
  } catch (err: any) {
    executionLogs.push(`[Execution Failure] ${err.message}`);
    res.status(500).json({
      success: false,
      message: err.message,
      logs: executionLogs,
    });
  }
});

// API: Export Current Page to PDF
app.get('/api/playwright/export-pdf', async (_req, res) => {
  if (!activePage || activePage.isClosed()) {
    return res.status(400).json({ success: false, message: 'No active page to export.' });
  }

  try {
    const pdfBuffer = await activePage.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="playwright_page_export.pdf"');
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'PDF export failed.' });
  }
});

// Setup Vite Dev Middleware or Static Serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Playwright Browser Studio running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
