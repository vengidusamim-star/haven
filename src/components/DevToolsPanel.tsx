import React, { useState } from 'react';
import {
  Code2,
  ListTree,
  Activity,
  Terminal,
  Play,
  Copy,
  Check,
  Search,
  MousePointer,
  Send,
  FileText,
  Clock,
  Layers,
  ChevronRight,
  Filter,
  AlertCircle,
} from 'lucide-react';
import type {
  PlaywrightNavigationResult,
  InteractiveElement,
  NetworkRequest,
  ConsoleLog,
} from '../types/browser.ts';

interface DevToolsPanelProps {
  data: PlaywrightNavigationResult | null;
  loading: boolean;
  selectedElement: InteractiveElement | null;
  onSelectElement: (el: InteractiveElement) => void;
  onPerformAction: (actionData: any) => Promise<any>;
  actionLoading: boolean;
  lastActionResult: { type: 'success' | 'error'; message: string } | null;
}

export const DevToolsPanel: React.FC<DevToolsPanelProps> = ({
  data,
  loading,
  selectedElement,
  onSelectElement,
  onPerformAction,
  actionLoading,
  lastActionResult,
}) => {
  const [activeTab, setActiveTab] = useState<'actions' | 'elements' | 'network' | 'console' | 'codegen' | 'meta'>('actions');

  // Interactive Action form states
  const [clickCoordX, setClickCoordX] = useState<string>('100');
  const [clickCoordY, setClickCoordY] = useState<string>('150');
  const [customSelector, setCustomSelector] = useState<string>('');
  const [fillSelector, setFillSelector] = useState<string>('input');
  const [fillValue, setFillValue] = useState<string>('Hello Playwright');
  const [selectedKey, setSelectedKey] = useState<string>('Enter');
  const [evalCode, setEvalCode] = useState<string>('document.title');
  const [evalOutput, setEvalOutput] = useState<any>(null);

  // Network & Console filter states
  const [networkFilterType, setNetworkFilterType] = useState<string>('all');
  const [networkSearch, setNetworkSearch] = useState<string>('');
  const [consoleFilterLevel, setConsoleFilterLevel] = useState<string>('all');
  const [consoleSearch, setConsoleSearch] = useState<string>('');
  const [elementSearch, setElementSearch] = useState<string>('');

  // Code generator state
  const [codeLang, setCodeLang] = useState<'typescript' | 'python' | 'csharp'>('typescript');
  const [copiedCode, setCopiedCode] = useState(false);

  // Custom Playwright script runner state
  const [scriptCode, setScriptCode] = useState<string>(
    `// Run Playwright automation on active page\nawait page.waitForTimeout(500);\nconst title = await page.title();\nlog('Current Page Title: ' + title);\n`
  );
  const [scriptRunning, setScriptRunning] = useState(false);
  const [scriptLogs, setScriptLogs] = useState<string[]>([]);

  // Update selector form when an element is selected from viewport
  React.useEffect(() => {
    if (selectedElement) {
      setCustomSelector(selectedElement.selector);
      if (selectedElement.tag === 'input' || selectedElement.tag === 'textarea') {
        setFillSelector(selectedElement.selector);
      }
      setClickCoordX(String(selectedElement.rect.x + Math.round(selectedElement.rect.width / 2)));
      setClickCoordY(String(selectedElement.rect.y + Math.round(selectedElement.rect.height / 2)));
    }
  }, [selectedElement]);

  const handleRunEval = async () => {
    if (!evalCode.trim()) return;
    try {
      const res = await onPerformAction({ action: 'evaluate', script: evalCode.trim() });
      setEvalOutput(res);
    } catch (err: any) {
      setEvalOutput(`Error: ${err.message}`);
    }
  };

  const handleRunScript = async () => {
    if (!scriptCode.trim()) return;
    setScriptRunning(true);
    setScriptLogs(['[Playwright Studio] Launching script sandbox...']);
    try {
      const response = await fetch('/api/playwright/run-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: scriptCode }),
      });
      const result = await response.json();
      if (result.success) {
        setScriptLogs(result.logs || ['Script completed successfully']);
      } else {
        setScriptLogs(result.logs || [`Error: ${result.message}`]);
      }
    } catch (err: any) {
      setScriptLogs((prev) => [...prev, `[Fatal Error] ${err.message}`]);
    } finally {
      setScriptRunning(false);
    }
  };

  // Generate Playwright code snippet
  const generatePlaywrightCode = (): string => {
    const url = data?.url || 'https://news.ycombinator.com';
    const width = data?.viewport.width || 1280;
    const height = data?.viewport.height || 800;

    if (codeLang === 'typescript') {
      return `import { test, expect } from '@playwright/test';

test('verify web page with Playwright', async ({ page }) => {
  // Set viewport
  await page.setViewportSize({ width: ${width}, height: ${height} });

  // Navigate to target URL
  await page.goto('${url}', { waitUntil: 'domcontentloaded' });

  // Expect title
  await expect(page).toHaveTitle(/.+/);

  ${
    selectedElement
      ? `// Interact with selected element\n  const target = page.locator('${selectedElement.selector}');\n  await expect(target).toBeVisible();\n  await target.click();\n`
      : `// Take full page screenshot\n  await page.screenshot({ path: 'screenshot.png', fullPage: true });\n`
  }
});`;
    }

    if (codeLang === 'python') {
      return `from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": ${width}, "height": ${height}})
    
    # Navigate to page
    page.goto("${url}")
    print("Page Title:", page.title())
    
    ${
      selectedElement
        ? `# Click targeted element\n    page.locator("${selectedElement.selector}").click()`
        : `# Capture screenshot\n    page.screenshot(path="screenshot.png")`
    }
    
    browser.close()`;
    }

    return `using Microsoft.Playwright;
using System.Threading.Tasks;

class Program
{
    public static async Task Main()
    {
        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync(new() { Headless = true });
        var page = await browser.NewPageAsync(new() {
            ViewportSize = new() { Width = ${width}, Height = ${height} }
        });

        await page.GotoAsync("${url}");
        System.Console.WriteLine($"Title: {await page.TitleAsync()}");
        
        await page.ScreenshotAsync(new() { Path = "screenshot.png" });
    }
}`;
  };

  const copyCodeToClipboard = () => {
    navigator.clipboard.writeText(generatePlaywrightCode());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Filtered Network Requests
  const filteredNetwork = (data?.networkRequests || []).filter((req: NetworkRequest) => {
    if (networkFilterType !== 'all') {
      if (networkFilterType === 'fetch' && req.resourceType !== 'fetch' && req.resourceType !== 'xhr') return false;
      if (networkFilterType === 'js' && req.resourceType !== 'script') return false;
      if (networkFilterType === 'css' && req.resourceType !== 'stylesheet') return false;
      if (networkFilterType === 'img' && req.resourceType !== 'image') return false;
      if (networkFilterType === 'doc' && req.resourceType !== 'document') return false;
    }
    if (networkSearch.trim() && !req.url.toLowerCase().includes(networkSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Filtered Console Logs
  const filteredLogs = (data?.consoleLogs || []).filter((log: ConsoleLog) => {
    if (consoleFilterLevel !== 'all' && log.type !== consoleFilterLevel) return false;
    if (consoleSearch.trim() && !log.text.toLowerCase().includes(consoleSearch.toLowerCase())) return false;
    return true;
  });

  // Filtered Interactive Elements
  const filteredElements = (data?.interactiveElements || []).filter((el: InteractiveElement) => {
    if (!elementSearch.trim()) return true;
    const term = elementSearch.toLowerCase();
    return (
      el.tag.toLowerCase().includes(term) ||
      el.text.toLowerCase().includes(term) ||
      el.selector.toLowerCase().includes(term)
    );
  });

  return (
    <div className="w-full lg:w-[480px] xl:w-[540px] shrink-0 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-full overflow-hidden select-none">
      {/* DevTools Tab Bar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-slate-950/80 border-b border-slate-800 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('actions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeTab === 'actions'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span>Actions & Runner</span>
        </button>

        <button
          onClick={() => setActiveTab('elements')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeTab === 'elements'
              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ListTree className="w-3.5 h-3.5" />
          <span>DOM Elements</span>
          {data?.interactiveElements && (
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1 rounded tabular-nums">
              {data.interactiveElements.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('network')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeTab === 'network'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Network</span>
          {data?.networkRequests && (
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1 rounded tabular-nums">
              {data.networkRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('console')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeTab === 'console'
              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Console</span>
          {data?.consoleLogs && data.consoleLogs.length > 0 && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1 rounded tabular-nums">
              {data.consoleLogs.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('codegen')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeTab === 'codegen'
              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Script Gen</span>
        </button>

        <button
          onClick={() => setActiveTab('meta')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
            activeTab === 'meta'
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Metadata</span>
        </button>
      </div>

      {/* DevTools Body Content */}
      <div className="flex-1 overflow-y-auto p-4 text-xs font-sans">
        {/* ================= ACTIONS TAB ================= */}
        {activeTab === 'actions' && (
          <div className="space-y-5">
            {lastActionResult && (
              <div
                className={`p-3 rounded-lg font-mono text-[11px] flex items-start gap-2 border ${
                  lastActionResult.type === 'error'
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                }`}
              >
                {lastActionResult.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                ) : (
                  <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                )}
                <div className="flex-1 space-y-1">
                  <p className="leading-relaxed">{lastActionResult.message}</p>
                </div>
              </div>
            )}

            {/* Click by Coordinate */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <MousePointer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Click by Coordinate (page.mouse.click)</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-slate-900 border border-slate-800 rounded px-2 py-1">
                  <span className="text-slate-500 mr-1 font-mono">X:</span>
                  <input
                    type="number"
                    value={clickCoordX}
                    onChange={(e) => setClickCoordX(e.target.value)}
                    className="w-full bg-transparent font-mono text-slate-200 focus:outline-none"
                  />
                </div>
                <div className="flex-1 flex items-center bg-slate-900 border border-slate-800 rounded px-2 py-1">
                  <span className="text-slate-500 mr-1 font-mono">Y:</span>
                  <input
                    type="number"
                    value={clickCoordY}
                    onChange={(e) => setClickCoordY(e.target.value)}
                    className="w-full bg-transparent font-mono text-slate-200 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() =>
                    onPerformAction({
                      action: 'click',
                      x: parseInt(clickCoordX, 10),
                      y: parseInt(clickCoordY, 10),
                    })
                  }
                  disabled={actionLoading || loading}
                  className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded font-medium transition-colors disabled:opacity-40"
                >
                  Click (X,Y)
                </button>
              </div>
            </div>

            {/* Click by Selector or Text */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
              <div className="text-slate-300 font-medium flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Click by Selector or Text Match</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">CSS or text</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customSelector}
                  onChange={(e) => setCustomSelector(e.target.value)}
                  placeholder="e.g. button.submit, #id, or button text"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono text-slate-200 placeholder-slate-600 focus:outline-none"
                />
                <button
                  onClick={() => onPerformAction({ action: 'click', selector: customSelector })}
                  disabled={actionLoading || loading || !customSelector.trim()}
                  className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded font-medium transition-colors disabled:opacity-40"
                >
                  Click Element
                </button>
              </div>
            </div>

            {/* Fill Input Text */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
              <div className="text-slate-300 font-medium flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-amber-400" />
                <span>Fill Text Field (page.fill)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={fillSelector}
                  onChange={(e) => setFillSelector(e.target.value)}
                  placeholder="Input selector"
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono text-slate-200 focus:outline-none"
                />
                <input
                  type="text"
                  value={fillValue}
                  onChange={(e) => setFillValue(e.target.value)}
                  placeholder="Text to type"
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none"
                />
              </div>
              <button
                onClick={() =>
                  onPerformAction({
                    action: 'fill',
                    selector: fillSelector,
                    value: fillValue,
                  })
                }
                disabled={actionLoading || loading}
                className="w-full py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-medium transition-colors disabled:opacity-40"
              >
                Fill Input Field
              </button>
            </div>

            {/* Keyboard Press */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
              <div className="text-slate-300 font-medium flex items-center justify-between">
                <span>Keyboard Press (page.keyboard.press)</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono text-slate-200 focus:outline-none"
                >
                  <option value="Enter">Enter</option>
                  <option value="Tab">Tab</option>
                  <option value="Escape">Escape</option>
                  <option value="ArrowDown">ArrowDown</option>
                  <option value="ArrowUp">ArrowUp</option>
                  <option value="Backspace">Backspace</option>
                </select>
                <button
                  onClick={() => onPerformAction({ action: 'press', key: selectedKey })}
                  disabled={actionLoading || loading}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium transition-colors disabled:opacity-40"
                >
                  Press Key
                </button>
              </div>
            </div>

            {/* Evaluate JavaScript in Browser REPL */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
              <div className="text-slate-300 font-medium flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-purple-400" />
                <span>Evaluate JS in Page Context (page.evaluate)</span>
              </div>
              <textarea
                value={evalCode}
                onChange={(e) => setEvalCode(e.target.value)}
                rows={2}
                placeholder="e.g. document.title, location.href, document.cookie"
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 font-mono text-slate-200 text-xs focus:outline-none"
              />
              <button
                onClick={handleRunEval}
                disabled={actionLoading || loading}
                className="w-full py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded font-medium transition-colors disabled:opacity-40"
              >
                Execute JS in Page
              </button>
              {evalOutput !== null && (
                <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 font-mono text-[11px] text-slate-300 break-all max-h-32 overflow-y-auto">
                  <span className="text-slate-500">Return: </span>
                  {typeof evalOutput === 'object' ? JSON.stringify(evalOutput, null, 2) : String(evalOutput)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= ELEMENTS TAB ================= */}
        {activeTab === 'elements' && (
          <div className="space-y-3">
            {/* Search Elements */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={elementSearch}
                onChange={(e) => setElementSearch(e.target.value)}
                placeholder="Filter elements by tag, text, or selector..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Elements List */}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredElements.map((el, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectElement(el)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                    selectedElement?.selector === el.selector
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sky-400 font-semibold text-[11px]">
                      &lt;{el.tag}
                      {el.id ? ` id="${el.id}"` : ''}&gt;
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                      ({el.rect.x}, {el.rect.y})
                    </span>
                  </div>
                  {el.text && (
                    <p className="text-slate-300 font-sans text-xs truncate mb-1">
                      "{el.text}"
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span className="text-slate-400 truncate max-w-[260px]">{el.selector}</span>
                    <span className="text-emerald-400 font-medium hover:underline">Select</span>
                  </div>
                </div>
              ))}

              {filteredElements.length === 0 && (
                <p className="text-center py-8 text-slate-500 text-xs">No matching elements found.</p>
              )}
            </div>
          </div>
        )}

        {/* ================= NETWORK TAB ================= */}
        {activeTab === 'network' && (
          <div className="space-y-3">
            {/* Filter chips & Search */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {['all', 'fetch', 'js', 'css', 'img', 'doc'].map((type) => (
                <button
                  key={type}
                  onClick={() => setNetworkFilterType(type)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase transition-colors ${
                    networkFilterType === type
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={networkSearch}
                onChange={(e) => setNetworkSearch(e.target.value)}
                placeholder="Filter requests by URL..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Requests Table */}
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredNetwork.map((req) => (
                <div
                  key={req.id}
                  className="p-2 bg-slate-950/50 border border-slate-800/80 rounded flex items-center justify-between gap-2 text-[11px] font-mono hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={`font-semibold shrink-0 ${
                        !req.status || req.status < 300
                          ? 'text-emerald-400'
                          : req.status < 400
                          ? 'text-sky-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {req.status || '---'}
                    </span>
                    <span className="text-slate-400 text-[10px] shrink-0 font-medium uppercase">
                      {req.method}
                    </span>
                    <span className="text-slate-300 truncate" title={req.url}>
                      {req.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-slate-500 text-[10px] tabular-nums">
                    <span className="uppercase">{req.resourceType}</span>
                    {req.duration && <span>{req.duration}ms</span>}
                  </div>
                </div>
              ))}

              {filteredNetwork.length === 0 && (
                <p className="text-center py-8 text-slate-500 text-xs">No network requests captured.</p>
              )}
            </div>
          </div>
        )}

        {/* ================= CONSOLE TAB ================= */}
        {activeTab === 'console' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {['all', 'log', 'info', 'warning', 'error'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setConsoleFilterLevel(lvl)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                      consoleFilterLevel === lvl
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={consoleSearch}
                onChange={(e) => setConsoleSearch(e.target.value)}
                placeholder="Filter log text..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1 font-mono text-[11px] max-h-[500px] overflow-y-auto">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2 rounded border leading-relaxed break-all ${
                    log.type === 'error'
                      ? 'bg-rose-950/30 border-rose-900/60 text-rose-300'
                      : log.type === 'warning'
                      ? 'bg-amber-950/30 border-amber-900/60 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                    <span className="uppercase font-semibold">[{log.type}]</span>
                    {log.location && <span className="truncate max-w-[200px]">{log.location}</span>}
                  </div>
                  <div>{log.text}</div>
                </div>
              ))}

              {filteredLogs.length === 0 && (
                <p className="text-center py-8 text-slate-500 text-xs">No console logs intercepted.</p>
              )}
            </div>
          </div>
        )}

        {/* ================= CODE GENERATOR & SCRIPT RUNNER TAB ================= */}
        {activeTab === 'codegen' && (
          <div className="space-y-4">
            {/* Generated Code Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Generated Playwright Test</span>
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded p-0.5">
                  {(['typescript', 'python', 'csharp'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setCodeLang(lang)}
                      className={`px-2 py-0.5 rounded text-[11px] capitalize transition-colors ${
                        codeLang === lang
                          ? 'bg-slate-800 text-white font-medium'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {lang === 'typescript' ? 'TS' : lang === 'python' ? 'Python' : 'C#'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative group">
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-60 leading-relaxed">
                  {generatePlaywrightCode()}
                </pre>
                <button
                  onClick={copyCodeToClipboard}
                  className="absolute top-2.5 right-2.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] flex items-center gap-1 transition-colors"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* In-Browser Automation Playground */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Execute Automation Script</span>
                </span>
                <button
                  onClick={handleRunScript}
                  disabled={scriptRunning}
                  className="px-3 py-1 bg-emerald-500 text-slate-950 font-semibold rounded hover:bg-emerald-400 transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{scriptRunning ? 'Running...' : 'Run Script'}</span>
                </button>
              </div>

              <textarea
                value={scriptCode}
                onChange={(e) => setScriptCode(e.target.value)}
                rows={4}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 font-mono text-slate-200 text-xs focus:outline-none"
              />

              {scriptLogs.length > 0 && (
                <div className="p-2 bg-slate-900 border border-slate-800 rounded font-mono text-[10px] text-slate-300 space-y-0.5 max-h-36 overflow-y-auto">
                  {scriptLogs.map((logLine, i) => (
                    <div key={i}>{logLine}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= METADATA & SEO TAB ================= */}
        {activeTab === 'meta' && (
          <div className="space-y-4">
            {/* OpenGraph Preview Card */}
            {data?.meta && (
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
                <span className="font-semibold text-slate-200">Social Share Preview (OpenGraph)</span>
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
                  {data.meta.ogImage ? (
                    <img
                      src={data.meta.ogImage}
                      alt="OpenGraph visual"
                      className="w-full h-36 object-cover bg-slate-800"
                    />
                  ) : (
                    <div className="w-full h-24 bg-slate-800/40 flex items-center justify-center text-slate-500 font-mono text-xs">
                      No og:image declared
                    </div>
                  )}
                  <div className="p-3 space-y-1">
                    <p className="font-semibold text-slate-200 text-xs truncate">
                      {data.meta.ogTitle || data.title}
                    </p>
                    <p className="text-slate-400 text-[11px] line-clamp-2">
                      {data.meta.description || 'No description meta tag provided by the page.'}
                    </p>
                    <p className="text-slate-500 font-mono text-[10px] truncate">{data.url}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Document Statistics */}
            {data?.stats && (
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <span className="text-slate-500 block text-[10px]">TOTAL DOM NODES</span>
                  <span className="text-base font-semibold text-slate-200 tabular-nums">
                    {data.stats.totalElements}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <span className="text-slate-500 block text-[10px]">ANCHOR LINKS</span>
                  <span className="text-base font-semibold text-slate-200 tabular-nums">
                    {data.stats.linksCount}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <span className="text-slate-500 block text-[10px]">IMAGES</span>
                  <span className="text-base font-semibold text-slate-200 tabular-nums">
                    {data.stats.imagesCount}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <span className="text-slate-500 block text-[10px]">SCRIPTS LOADED</span>
                  <span className="text-base font-semibold text-slate-200 tabular-nums">
                    {data.stats.scriptsCount}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
