import React, { useState, useRef, useEffect } from 'react';
import {
  Globe,
  Lock,
  ArrowRight,
  RotateCw,
  Sliders,
  ChevronDown,
  Crosshair,
  MousePointer,
  Moon,
  Sun,
  Maximize2,
  Bookmark,
  Sparkles,
} from 'lucide-react';
import { DEVICE_PRESETS, SAMPLE_URL_PRESETS, type ViewportConfig } from '../types/browser.ts';

interface UrlBarProps {
  currentUrl: string;
  onNavigate: (url: string, options?: Partial<NavigateOptions>) => void;
  loading: boolean;
  selectedViewport: ViewportConfig;
  setSelectedViewport: (vp: ViewportConfig) => void;
  colorScheme: 'dark' | 'light';
  setColorScheme: (cs: 'dark' | 'light') => void;
  fullPage: boolean;
  setFullPage: (fp: boolean) => void;
  inspectorMode: boolean;
  setInspectorMode: (im: boolean) => void;
  interactiveClickMode: boolean;
  setInteractiveClickMode: (icm: boolean) => void;
  zoomScale: number;
  setZoomScale: (z: number) => void;
}

export interface NavigateOptions {
  viewport?: ViewportConfig;
  colorScheme?: 'dark' | 'light';
  fullPage?: boolean;
}

export const UrlBar: React.FC<UrlBarProps> = ({
  currentUrl,
  onNavigate,
  loading,
  selectedViewport,
  setSelectedViewport,
  colorScheme,
  setColorScheme,
  fullPage,
  setFullPage,
  inspectorMode,
  setInspectorMode,
  interactiveClickMode,
  setInteractiveClickMode,
  zoomScale,
  setZoomScale,
}) => {
  const [inputValue, setInputValue] = useState(currentUrl);
  const [showPresets, setShowPresets] = useState(false);
  const [showViewportMenu, setShowViewportMenu] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Sync internal input when parent updates currentUrl
  useEffect(() => {
    setInputValue(currentUrl);
  }, [currentUrl]);

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
      if (viewportRef.current && !viewportRef.current.contains(e.target as Node)) {
        setShowViewportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onNavigate(inputValue.trim());
  };

  const handleSelectPreset = (url: string) => {
    setInputValue(url);
    setShowPresets(false);
    onNavigate(url);
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800/80 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        {/* Browser Chrome Address Field */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          {/* Reload Button */}
          <button
            type="button"
            onClick={() => onNavigate(inputValue || currentUrl)}
            disabled={loading}
            title="Reload page with Playwright"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors disabled:opacity-40"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* Omnibox Container */}
          <div className="relative flex-1 flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all">
            <div className="flex items-center gap-1.5 text-slate-500 mr-2 shrink-0">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <Globe className="w-3.5 h-3.5" />
            </div>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter URL to render with Playwright (e.g. news.ycombinator.com)"
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
            />

            {/* Presets trigger button */}
            <div className="relative" ref={presetsRef}>
              <button
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                title="Select sample test sites"
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
              >
                <Bookmark className="w-3 h-3 text-emerald-400" />
                <span className="hidden sm:inline">Samples</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {/* Sample Presets Dropdown */}
              {showPresets && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl py-2 z-50">
                  <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-medium">
                    <span>Popular Test URL Presets</span>
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {SAMPLE_URL_PRESETS.map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => handleSelectPreset(preset.url)}
                        className="w-full px-3 py-2 text-left hover:bg-slate-800/80 transition-colors flex flex-col gap-0.5 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                            {preset.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{preset.category}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 line-clamp-1">{preset.description}</span>
                        <span className="text-[10px] text-slate-500 font-mono truncate">{preset.url}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Submit Arrow */}
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              title="Go to URL"
              className="ml-2 p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Browser Emulation & Controls Strip */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Viewport Preset Selector */}
          <div className="relative" ref={viewportRef}>
            <button
              type="button"
              onClick={() => setShowViewportMenu(!showViewportMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700/60 rounded-md text-slate-200 font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>{selectedViewport.name.split(' ')[0]}</span>
              <span className="text-slate-400 font-mono tabular-nums">
                ({selectedViewport.width}×{selectedViewport.height})
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showViewportMenu && (
              <div className="absolute left-0 lg:right-0 lg:left-auto top-full mt-2 w-64 bg-slate-900 border border-slate-700/80 rounded-lg shadow-xl py-1 z-50">
                <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] text-slate-400 font-medium">
                  Device & Viewport Emulation
                </div>
                {DEVICE_PRESETS.map((device) => (
                  <button
                    key={device.name}
                    type="button"
                    onClick={() => {
                      setSelectedViewport(device);
                      setShowViewportMenu(false);
                      onNavigate(currentUrl, { viewport: device });
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-800 transition-colors ${
                      selectedViewport.name === device.name ? 'text-emerald-400 font-semibold bg-emerald-500/10' : 'text-slate-300'
                    }`}
                  >
                    <span>{device.name}</span>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {device.width}×{device.height}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Color Scheme Emulation Toggle */}
          <button
            type="button"
            onClick={() => {
              const nextScheme = colorScheme === 'dark' ? 'light' : 'dark';
              setColorScheme(nextScheme);
              onNavigate(currentUrl, { colorScheme: nextScheme });
            }}
            title={`Emulate ${colorScheme === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700/60 rounded-md text-slate-300 transition-colors whitespace-nowrap shrink-0"
          >
            {colorScheme === 'dark' ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
            <span className="capitalize">{colorScheme}</span>
          </button>

          {/* Full Page Capture Toggle */}
          <button
            type="button"
            onClick={() => {
              const nextFullPage = !fullPage;
              setFullPage(nextFullPage);
              onNavigate(currentUrl, { fullPage: nextFullPage });
            }}
            title="Toggle Full Scrollable Page Capture"
            className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-md transition-colors whitespace-nowrap shrink-0 ${
              fullPage
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/90 hover:bg-slate-700/80 border-slate-700/60 text-slate-300'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Full Height</span>
          </button>

          {/* Inspector Mode (Element Crosshair) */}
          <button
            type="button"
            onClick={() => {
              setInspectorMode(!inspectorMode);
              if (!inspectorMode) setInteractiveClickMode(false);
            }}
            title="Hover to highlight DOM elements & generate Playwright locators"
            className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-md transition-colors whitespace-nowrap shrink-0 ${
              inspectorMode
                ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 ring-1 ring-sky-500/40'
                : 'bg-slate-800/90 hover:bg-slate-700/80 border-slate-700/60 text-slate-300'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Inspect DOM</span>
          </button>

          {/* Live Interactive Click Mode */}
          <button
            type="button"
            onClick={() => {
              setInteractiveClickMode(!interactiveClickMode);
              if (!interactiveClickMode) setInspectorMode(false);
            }}
            title="Click anywhere on the preview to trigger real Playwright clicks"
            className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-md transition-colors whitespace-nowrap shrink-0 ${
              interactiveClickMode
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/40'
                : 'bg-slate-800/90 hover:bg-slate-700/80 border-slate-700/60 text-slate-300'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Click to Browse</span>
          </button>

          {/* Zoom scale selector */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-800/90 border border-slate-700/60 rounded-md p-0.5">
            {[0.75, 1, 1.25].map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => setZoomScale(scale)}
                className={`px-1.5 py-1 text-[11px] font-mono rounded transition-colors tabular-nums ${
                  zoomScale === scale ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {Math.round(scale * 100)}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
