import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowDown,
  ArrowUp,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Copy,
  Info,
  ChevronsUp,
  ChevronsDown,
} from 'lucide-react';
import type { PlaywrightNavigationResult, InteractiveElement } from '../types/browser.ts';

interface BrowserViewportProps {
  data: PlaywrightNavigationResult | null;
  loading: boolean;
  onDirectClick: (x: number, y: number) => void;
  onScroll: (direction: 'up' | 'down' | 'top' | 'bottom') => void;
  onFastScroll?: (deltaY?: number, direction?: 'up' | 'down' | 'top' | 'bottom', targetY?: number) => void;
  isScrolling?: boolean;
  onRecapture: () => void;
  inspectorMode: boolean;
  interactiveClickMode: boolean;
  zoomScale: number;
  onSelectElement: (element: InteractiveElement) => void;
  selectedElement: InteractiveElement | null;
}

export const BrowserViewport: React.FC<BrowserViewportProps> = ({
  data,
  loading,
  onDirectClick,
  onScroll,
  onFastScroll,
  isScrolling = false,
  onRecapture,
  inspectorMode,
  interactiveClickMode,
  zoomScale,
  onSelectElement,
  selectedElement,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);
  const [hoveredElement, setHoveredElement] = useState<InteractiveElement | null>(null);
  const [copiedLocator, setCopiedLocator] = useState(false);

  // Wheel accumulation for high-performance scroll
  const wheelTimeoutRef = useRef<any>(null);
  const accumulatedDeltaRef = useRef<number>(0);

  // Focus container for keyboard shortcuts
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, [data?.url]);

  // Compute coordinate mapping from container space to image original coordinate space
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (clientX < 0 || clientY < 0 || clientX > rect.width || clientY > rect.height) {
      setHoverCoord(null);
      setHoveredElement(null);
      return;
    }

    // Scale to original page coordinate
    const naturalWidth = data?.viewport.width || imageRef.current.naturalWidth || 1280;
    const naturalHeight = data?.viewport.height || imageRef.current.naturalHeight || 800;
    const scaleX = naturalWidth / rect.width;
    const scaleY = naturalHeight / rect.height;

    const pageX = Math.round(clientX * scaleX);
    const pageY = Math.round(clientY * scaleY);

    setHoverCoord({ x: pageX, y: pageY });

    if (inspectorMode && data?.interactiveElements) {
      const match = data.interactiveElements.find(
        (el) =>
          pageX >= el.rect.x &&
          pageX <= el.rect.x + el.rect.width &&
          pageY >= el.rect.y &&
          pageY <= el.rect.y + el.rect.height
      );
      setHoveredElement(match || null);
    }
  };

  const handleClick = () => {
    if (!hoverCoord || loading || isScrolling) return;

    if (inspectorMode) {
      if (hoveredElement) {
        onSelectElement(hoveredElement);
      }
    } else if (interactiveClickMode) {
      onDirectClick(hoverCoord.x, hoverCoord.y);
    }
  };

  // High-performance mouse wheel scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (loading || !data || data.viewport.fullPage) {
      return; // allow natural browser scrolling if in full page mode
    }

    e.preventDefault();
    accumulatedDeltaRef.current += e.deltaY;

    if (wheelTimeoutRef.current) return;

    wheelTimeoutRef.current = setTimeout(() => {
      const delta = accumulatedDeltaRef.current;
      accumulatedDeltaRef.current = 0;
      wheelTimeoutRef.current = null;

      if (Math.abs(delta) > 10) {
        if (onFastScroll) {
          onFastScroll(Math.round(delta * 1.2));
        } else {
          onScroll(delta > 0 ? 'down' : 'up');
        }
      }
    }, 40); // 40ms fast batching
  };

  // Keyboard navigation for page scrolling
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!data || loading || data.viewport.fullPage) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onFastScroll ? onFastScroll(200) : onScroll('down');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onFastScroll ? onFastScroll(-200) : onScroll('up');
    } else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
      e.preventDefault();
      onFastScroll ? onFastScroll(undefined, 'down') : onScroll('down');
    } else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
      e.preventDefault();
      onFastScroll ? onFastScroll(undefined, 'up') : onScroll('up');
    } else if (e.key === 'Home') {
      e.preventDefault();
      onFastScroll ? onFastScroll(undefined, 'top') : onScroll('top');
    } else if (e.key === 'End') {
      e.preventDefault();
      onFastScroll ? onFastScroll(undefined, 'bottom') : onScroll('bottom');
    }
  };

  const copyPlaywrightCode = (selector: string) => {
    const code = `await page.locator('${selector}').click();`;
    navigator.clipboard.writeText(code);
    setCopiedLocator(true);
    setTimeout(() => setCopiedLocator(false), 2000);
  };

  // Scroll math
  const docHeight = data?.docHeight || data?.stats?.bodyHeight || 1200;
  const viewHeight = data?.viewport?.height || 800;
  const currentScrollY = data?.scrollY || 0;
  const maxScroll = Math.max(1, docHeight - viewHeight);
  const scrollPercent = Math.min(100, Math.max(0, Math.round((currentScrollY / maxScroll) * 100)));

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onFastScroll || !data || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, clickY / rect.height));
    const targetY = Math.round(ratio * maxScroll);
    onFastScroll(undefined, undefined, targetY);
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex-1 flex flex-col bg-slate-950/60 overflow-hidden relative focus:outline-none"
    >
      {/* Browser Window Chrome Top Bezel */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs select-none">
        {/* macOS Style Window Controls */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600" />
          <span className="ml-2 font-mono text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md">
            {data?.title || 'Playwright Headless Chromium Engine'}
          </span>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
          {data && (
            <>
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3 h-3" />
                <span>{data.status} {data.statusText}</span>
              </span>
              <span>·</span>
              <span className="tabular-nums">{data.durationMs}ms</span>
              <span>·</span>
              <span className="tabular-nums">{data.viewport.width}×{data.viewport.height}</span>
            </>
          )}

          {/* External tab link */}
          {data?.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              title="Open direct URL in new tab"
              className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Floating Action HUD Toolbar (Scroll & Quick Controls) */}
      <div className="absolute top-12 right-6 z-30 flex items-center gap-1 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-1 rounded-lg shadow-xl text-xs select-none">
        <button
          onClick={() => (onFastScroll ? onFastScroll(undefined, 'top') : onScroll('top'))}
          disabled={loading || !data}
          title="Scroll to Top (Home)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
        >
          <ChevronsUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => (onFastScroll ? onFastScroll(undefined, 'up') : onScroll('up'))}
          disabled={loading || !data}
          title="Page Up (PageUp / Shift+Space)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => (onFastScroll ? onFastScroll(undefined, 'down') : onScroll('down'))}
          disabled={loading || !data}
          title="Page Down (PageDown / Space)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => (onFastScroll ? onFastScroll(undefined, 'bottom') : onScroll('bottom'))}
          disabled={loading || !data}
          title="Scroll to Bottom (End)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
        >
          <ChevronsDown className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-700 mx-0.5" />

        <button
          onClick={onRecapture}
          disabled={loading || !data}
          title="Recapture Viewport"
          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isScrolling ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {/* Scroll percentage badge */}
        {!data?.viewport.fullPage && (
          <div className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-emerald-400 tabular-nums">
            {isScrolling ? 'Scrolling...' : `Scroll ${scrollPercent}%`}
          </div>
        )}

        {hoverCoord && (
          <div className="hidden sm:block px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-sky-400 tabular-nums">
            X:{hoverCoord.x} Y:{hoverCoord.y}
          </div>
        )}
      </div>

      {/* Inspector Element Banner Tooltip */}
      {inspectorMode && hoveredElement && (
        <div className="absolute top-12 left-6 z-30 bg-slate-900/95 border border-sky-500/50 rounded-lg p-2.5 shadow-2xl max-w-md backdrop-blur-md text-xs">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="font-mono font-semibold text-sky-400">
              &lt;{hoveredElement.tag}
              {hoveredElement.id ? ` id="${hoveredElement.id}"` : ''}&gt;
            </span>
            <span className="text-[10px] text-slate-400 font-mono tabular-nums">
              {hoveredElement.rect.width}×{hoveredElement.rect.height} px
            </span>
          </div>
          {hoveredElement.text && (
            <p className="text-slate-300 font-sans text-xs truncate max-w-sm mb-1.5">
              "{hoveredElement.text}"
            </p>
          )}
          <div className="flex items-center gap-2">
            <code className="text-[11px] font-mono text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 truncate flex-1">
              page.locator('{hoveredElement.selector}')
            </code>
            <button
              onClick={() => copyPlaywrightCode(hoveredElement.selector)}
              title="Copy Playwright locator"
              className="p-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            >
              {copiedLocator ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}

      {/* Interactive Click Notice Banner */}
      {interactiveClickMode && (
        <div className="absolute top-12 left-6 z-30 bg-amber-950/80 border border-amber-500/40 text-amber-200 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 shadow-lg backdrop-blur-md">
          <Info className="w-3.5 h-3.5 text-amber-400" />
          <span>Interactive Mode: Click anywhere to send a Playwright mouse click</span>
        </div>
      )}

      {/* Main Viewport Canvas with Mouse Wheel Support */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHoverCoord(null);
          setHoveredElement(null);
        }}
        onClick={handleClick}
        className={`flex-1 overflow-auto p-4 sm:p-6 flex items-start justify-center relative ${
          interactiveClickMode
            ? 'cursor-pointer'
            : inspectorMode
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
      >
        {loading ? (
          <div className="w-full max-w-4xl min-h-[500px] flex flex-col items-center justify-center p-8 bg-slate-900/40 border border-slate-800/80 rounded-xl">
            <div className="relative mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <RotateCw className="w-6 h-6 text-emerald-400 animate-spin" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">
              Executing Playwright Chromium Navigation
            </h3>
            <p className="text-xs text-slate-400 text-center max-w-md">
              Launching headless browser context, loading DOM tree, evaluating styles, and capturing high-resolution render...
            </p>
          </div>
        ) : data && data.screenshot ? (
          <div className="flex items-start gap-1">
            {/* Rendered Browser Page Container */}
            <div
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-out',
              }}
              className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-white"
            >
              <img
                ref={imageRef}
                src={data.screenshot}
                alt={data.title || 'Playwright Rendered Page'}
                className="block max-w-none select-none pointer-events-none"
                style={{
                  width: data.viewport.width,
                  height: data.viewport.fullPage ? 'auto' : data.viewport.height,
                }}
              />

              {/* Selected Element Box Highlight */}
              {selectedElement && (
                <div
                  style={{
                    position: 'absolute',
                    left: selectedElement.rect.x,
                    top: selectedElement.rect.y,
                    width: selectedElement.rect.width,
                    height: selectedElement.rect.height,
                  }}
                  className="border-2 border-emerald-500 bg-emerald-500/20 pointer-events-none z-20"
                >
                  <span className="absolute -top-5 left-0 px-1 py-0.2 bg-emerald-600 text-white font-mono text-[10px] rounded">
                    {selectedElement.selector}
                  </span>
                </div>
              )}

              {/* Hovered Element in Inspector Mode */}
              {inspectorMode && hoveredElement && (
                <div
                  style={{
                    position: 'absolute',
                    left: hoveredElement.rect.x,
                    top: hoveredElement.rect.y,
                    width: hoveredElement.rect.width,
                    height: hoveredElement.rect.height,
                  }}
                  className="border-2 border-sky-400 bg-sky-400/20 pointer-events-none z-10 transition-all duration-75"
                />
              )}
            </div>

            {/* Interactive Browser Right Scrollbar Track */}
            {!data.viewport.fullPage && (
              <div
                onClick={handleTrackClick}
                title="Interactive Scrollbar: Click anywhere on track to jump"
                className="w-3.5 rounded-full bg-slate-900/80 border border-slate-800 relative cursor-pointer hover:bg-slate-800 transition-colors select-none shrink-0"
                style={{
                  height: (data.viewport.height || 800) * zoomScale,
                }}
              >
                {/* Scrollbar thumb */}
                <div
                  style={{
                    top: `${scrollPercent}%`,
                    transform: `translateY(-${scrollPercent}%)`,
                    height: `${Math.max(12, Math.min(60, (viewHeight / docHeight) * 100))}%`,
                  }}
                  className="absolute left-0.5 right-0.5 rounded-full bg-emerald-500/60 hover:bg-emerald-400 transition-all shadow-sm"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-xl p-8 bg-slate-900 border border-slate-800 rounded-xl text-center">
            <p className="text-sm text-slate-300 font-medium mb-1">No Page Loaded Yet</p>
            <p className="text-xs text-slate-500 mb-4">
              Enter any URL in the omnibar above or select a preset to launch Playwright.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between font-mono select-none">
        <div className="flex items-center gap-3 truncate">
          <span className="text-slate-300 truncate">{data?.url || 'Ready'}</span>
          {data?.stats && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline text-slate-400 tabular-nums">
                {data.stats.totalElements} DOM Nodes
              </span>
              <span className="hidden md:inline">·</span>
              <span className="hidden md:inline text-slate-400 tabular-nums">
                {data.stats.linksCount} Links
              </span>
              <span className="hidden md:inline">·</span>
              <span className="hidden md:inline text-slate-400 tabular-nums">
                Scroll: {scrollPercent}% ({currentScrollY}px)
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-slate-500 text-[10px]">Mouse Wheel & Arrow Keys enabled</span>
          <span>·</span>
          <span>Engine: Chromium Headless</span>
        </div>
      </div>
    </div>
  );
};
