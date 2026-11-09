import React, { useState, useEffect, useCallback } from 'react';
import { TopNav } from './components/TopNav.tsx';
import { UrlBar, type NavigateOptions } from './components/UrlBar.tsx';
import { BrowserViewport } from './components/BrowserViewport.tsx';
import { DevToolsPanel } from './components/DevToolsPanel.tsx';
import {
  DEVICE_PRESETS,
  SAMPLE_URL_PRESETS,
  type PlaywrightNavigationResult,
  type ViewportConfig,
  type InteractiveElement,
} from './types/browser.ts';
import { AlertCircle, RefreshCw } from 'lucide-react';

async function parseApiResponse(response: Response): Promise<any> {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    throw new Error(
      response.ok
        ? `Playwright service returned an invalid response (${contentType})`
        : `Playwright service returned ${response.status} instead of JSON`
    );
  }
}

export default function App() {
  const [currentUrl, setCurrentUrl] = useState<string>('https://news.ycombinator.com');
  const [navigationData, setNavigationData] = useState<PlaywrightNavigationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Emulation states
  const [selectedViewport, setSelectedViewport] = useState<ViewportConfig>(DEVICE_PRESETS[0]);
  const [colorScheme, setColorScheme] = useState<'dark' | 'light'>('dark');
  const [fullPage, setFullPage] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Interaction modes
  const [inspectorMode, setInspectorMode] = useState<boolean>(false);
  const [interactiveClickMode, setInteractiveClickMode] = useState<boolean>(false);
  const [selectedElement, setSelectedElement] = useState<InteractiveElement | null>(null);

  // Active top-level tab
  const [activeTab, setActiveTab] = useState<'preview' | 'devtools' | 'script' | 'info'>('preview');

  // Action state
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [lastActionResult, setLastActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Core navigation handler with Playwright backend
  const handleNavigate = useCallback(
    async (urlToLoad: string, options?: Partial<NavigateOptions>) => {
      setLoading(true);
      setErrorMessage(null);
      setSelectedElement(null);

      const targetViewport = options?.viewport || selectedViewport;
      const targetColorScheme = options?.colorScheme || colorScheme;
      const targetFullPage = options?.fullPage !== undefined ? options.fullPage : fullPage;

      try {
        const response = await fetch('/api/playwright/navigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: urlToLoad,
            viewport: {
              width: targetViewport.width,
              height: targetViewport.height,
            },
            isMobile: Boolean(targetViewport.isMobile),
            colorScheme: targetColorScheme,
            fullPage: targetFullPage,
            timeoutMs: 25000,
          }),
        });

        const data = await parseApiResponse(response);

        if (response.ok && data.success) {
          setNavigationData(data);
          setCurrentUrl(data.url);
        } else {
          setErrorMessage(data.message || 'Failed to render page with Playwright');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Network error connecting to Playwright service');
      } finally {
        setLoading(false);
      }
    },
    [selectedViewport, colorScheme, fullPage]
  );

  // Initial navigation on load
  useEffect(() => {
    handleNavigate(currentUrl);
  }, []);

  // Handle direct click from viewport canvas
  const handleDirectClick = async (x: number, y: number) => {
    setActionLoading(true);
    setLastActionResult(null);
    try {
      const response = await fetch('/api/playwright/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'click', x, y }),
      });
      const result = await parseApiResponse(response);
      if (result.success) {
        setLastActionResult({ type: 'success', message: `Clicked coordinate (${x}, ${y})` });
        if (result.screenshot && navigationData) {
          setNavigationData({
            ...navigationData,
            title: result.title || navigationData.title,
            url: result.url || navigationData.url,
            screenshot: result.screenshot,
            networkRequests: result.networkRequests || navigationData.networkRequests,
            consoleLogs: result.consoleLogs || navigationData.consoleLogs,
          });
          setCurrentUrl(result.url || navigationData.url);
        }
      } else {
        setLastActionResult({ type: 'error', message: result.message || 'Click could not be completed' });
      }
    } catch (err: any) {
      setLastActionResult({ type: 'error', message: `Click failed: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle interactive action from DevTools safely
  const handlePerformAction = async (actionData: any): Promise<any> => {
    setActionLoading(true);
    setLastActionResult(null);
    try {
      const response = await fetch('/api/playwright/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData),
      });
      const result = await parseApiResponse(response);
      if (result.success) {
        setLastActionResult({ type: 'success', message: result.actionResult || 'Action completed' });
        if (result.screenshot && navigationData) {
          setNavigationData({
            ...navigationData,
            title: result.title || navigationData.title,
            url: result.url || navigationData.url,
            screenshot: result.screenshot,
            networkRequests: result.networkRequests || navigationData.networkRequests,
            consoleLogs: result.consoleLogs || navigationData.consoleLogs,
          });
          setCurrentUrl(result.url || navigationData.url);
        }
        return result.actionResult;
      } else {
        setLastActionResult({ type: 'error', message: result.message || 'Action could not be completed' });
        if (result.screenshot && navigationData) {
          setNavigationData({
            ...navigationData,
            screenshot: result.screenshot,
          });
        }
        return null;
      }
    } catch (err: any) {
      setLastActionResult({ type: 'error', message: err.message || 'Network error executing action' });
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  const [isScrolling, setIsScrolling] = useState<boolean>(false);
  const scrollLockRef = React.useRef<boolean>(false);

  // High-performance low-latency scroll handler
  const handleFastScroll = useCallback(
    async (deltaY?: number, direction?: 'up' | 'down' | 'top' | 'bottom', targetY?: number) => {
      if (scrollLockRef.current) return;
      scrollLockRef.current = true;
      setIsScrolling(true);

      try {
        const response = await fetch('/api/playwright/scroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deltaY, direction, targetY }),
        });

        const result = await parseApiResponse(response);
        if (result.success && result.screenshot) {
          setNavigationData((prev) =>
            prev
              ? {
                  ...prev,
                  screenshot: result.screenshot,
                  scrollY: result.scrollY,
                  maxScrollY: result.maxScrollY,
                  docHeight: result.docHeight,
                }
              : null
          );
        }
      } catch (err: any) {
        console.warn('Fast scroll error:', err);
      } finally {
        scrollLockRef.current = false;
        setIsScrolling(false);
      }
    },
    []
  );

  // Scroll helper
  const handleScroll = (direction: 'up' | 'down' | 'top' | 'bottom') => {
    handleFastScroll(undefined, direction);
  };

  // Recapture screenshot helper
  const handleRecapture = () => {
    handlePerformAction({ action: 'screenshot' });
  };

  // PDF Export
  const handleExportPdf = () => {
    const link = document.createElement('a');
    link.href = '/api/playwright/export-pdf';
    link.download = `playwright_${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Run (reloads or picks next preset)
  const handleQuickRun = () => {
    handleNavigate(currentUrl);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans antialiased overflow-hidden">
      {/* 3-Zone Top Navigation Contract */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onQuickRun={handleQuickRun}
        onExportPdf={handleExportPdf}
        loading={loading}
        activeUrl={currentUrl}
      />

      {/* Browser Omnibar & Emulation Controls */}
      <UrlBar
        currentUrl={currentUrl}
        onNavigate={(url, opts) => handleNavigate(url, opts)}
        loading={loading}
        selectedViewport={selectedViewport}
        setSelectedViewport={setSelectedViewport}
        colorScheme={colorScheme}
        setColorScheme={setColorScheme}
        fullPage={fullPage}
        setFullPage={setFullPage}
        inspectorMode={inspectorMode}
        setInspectorMode={setInspectorMode}
        interactiveClickMode={interactiveClickMode}
        setInteractiveClickMode={setInteractiveClickMode}
        zoomScale={zoomScale}
        setZoomScale={setZoomScale}
      />

      {/* Error Banner if navigation failed */}
      {errorMessage && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleNavigate(SAMPLE_URL_PRESETS[0].url)}
              className="px-2 py-1 bg-rose-900/60 hover:bg-rose-800 rounded font-medium transition-colors text-white"
            >
              Load Sample Page
            </button>
            <button
              onClick={() => handleNavigate(currentUrl)}
              className="p-1 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Viewport (Browser Canvas + DevTools Panel) */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        <BrowserViewport
          data={navigationData}
          loading={loading}
          onDirectClick={handleDirectClick}
          onScroll={handleScroll}
          onFastScroll={handleFastScroll}
          isScrolling={isScrolling}
          onRecapture={handleRecapture}
          inspectorMode={inspectorMode}
          interactiveClickMode={interactiveClickMode}
          zoomScale={zoomScale}
          onSelectElement={setSelectedElement}
          selectedElement={selectedElement}
        />

        <DevToolsPanel
          data={navigationData}
          loading={loading}
          selectedElement={selectedElement}
          onSelectElement={setSelectedElement}
          onPerformAction={handlePerformAction}
          actionLoading={actionLoading}
          lastActionResult={lastActionResult}
        />
      </main>
    </div>
  );
}
