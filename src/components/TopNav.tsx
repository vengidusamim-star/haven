import React from 'react';
import { Play, Download, RefreshCw, FileCode, Monitor, Laptop } from 'lucide-react';

interface TopNavProps {
  activeTab: 'preview' | 'devtools' | 'script' | 'info';
  setActiveTab: (tab: 'preview' | 'devtools' | 'script' | 'info') => void;
  onQuickRun: () => void;
  onExportPdf: () => void;
  loading: boolean;
  activeUrl: string;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  onQuickRun,
  onExportPdf,
  loading,
  activeUrl,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40 select-none">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <Monitor className="w-4 h-4" />
        </div>
        <a href="/" className="text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-emerald-400 transition-colors">
          Playwright Browser Studio
        </a>
      </div>

      {/* Zone 2: 4-5 clean single-line navigation links/modes */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'preview' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
          }`}
        >
          <Laptop className="w-3.5 h-3.5" />
          <span>Live Browser View</span>
        </button>

        <button
          onClick={() => setActiveTab('devtools')}
          className={`flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'devtools' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>DevTools & Network</span>
        </button>

        <button
          onClick={() => setActiveTab('script')}
          className={`flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'script' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Automation Scripts</span>
        </button>

        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'info' ? 'text-emerald-400 font-semibold' : 'hover:text-slate-200'
          }`}
        >
          <span>Page Meta & SEO</span>
        </button>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onExportPdf}
          disabled={loading || !activeUrl}
          title="Export current page as PDF via Playwright"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700/60 rounded-md hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export PDF</span>
        </button>

        <button
          onClick={onQuickRun}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-slate-950 bg-emerald-400 rounded-md hover:bg-emerald-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 shadow-sm"
        >
          {loading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Rendering...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch Page</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
