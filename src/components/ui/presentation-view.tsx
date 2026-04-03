'use client';

import { useState, useEffect, ReactNode, useCallback } from 'react';
import { TextSizeControls, useTextSize } from './text-size-provider';

type FocusMode = 'transcript' | 'summary' | 'questions' | 'quotes' | 'audience';

interface PresentationViewProps {
  sessionTitle: string;
  sessionCode: string;
  isLive: boolean;
  focusModes: Array<{ key: FocusMode; label: string; icon: string }>;
  children: (focusMode: FocusMode) => ReactNode;
  sidebarContent?: ReactNode;
  externalFocusMode?: string | null; // Set by moderator remote control
}

export function PresentationView({
  sessionTitle,
  sessionCode,
  isLive,
  focusModes,
  children,
  sidebarContent,
  externalFocusMode,
}: PresentationViewProps) {
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [showKeyHints, setShowKeyHints] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>(focusModes[0]?.key || 'transcript');

  // React to moderator remote control
  useEffect(() => {
    if (externalFocusMode && focusModes.some((m) => m.key === externalFocusMode)) {
      setFocusMode(externalFocusMode as FocusMode);
    }
  }, [externalFocusMode, focusModes]);
  const [showSidebar, setShowSidebar] = useState(true);
  const { scale } = useTextSize();

  // F11 or Escape to toggle presentation mode
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'F11') {
        e.preventDefault();
        setIsPresentationMode((p) => !p);
      }
      if (e.key === 'Escape' && isPresentationMode) {
        setIsPresentationMode(false);
      }
      // Number keys 1-5 to switch focus mode
      const num = parseInt(e.key);
      if (num >= 1 && num <= focusModes.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          setFocusMode(focusModes[num - 1].key);
        }
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isPresentationMode, focusModes]);

  // Auto-enter fullscreen in presentation mode
  useEffect(() => {
    if (isPresentationMode) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      document.body.classList.add('presentation-mode');
      setShowKeyHints(true);
      setTimeout(() => setShowKeyHints(false), 4000);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      document.body.classList.remove('presentation-mode');
    }
    return () => {
      document.body.classList.remove('presentation-mode');
    };
  }, [isPresentationMode]);

  const togglePresentation = useCallback(() => {
    setIsPresentationMode((p) => !p);
  }, []);

  // === PRESENTATION MODE ===
  if (isPresentationMode) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        {/* Minimal header */}
        <div className="presentation-header flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-white">{sessionTitle}</h1>
            {isLive && <span className="badge-live">LIVE</span>}
          </div>
          <div className="flex items-center gap-3">
            <TextSizeControls />
            <span className="text-sm text-gray-500 font-mono">{sessionCode}</span>
            <button onClick={togglePresentation} className="btn-ghost text-sm">
              Esc
            </button>
          </div>
        </div>

        {/* Focus mode selector */}
        <div className="px-6 py-3 flex-shrink-0">
          <div className="focus-selector max-w-2xl mx-auto">
            {focusModes.map((mode, i) => (
              <button
                key={mode.key}
                onClick={() => setFocusMode(mode.key)}
                className={`focus-btn ${focusMode === mode.key ? 'focus-btn-active' : ''}`}
              >
                <span className="mr-1.5">{mode.icon}</span>
                {mode.label}
                <span className="ml-1 text-xs opacity-50">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content — full screen, large text */}
        {/* Keyboard hints overlay — shown briefly on enter */}
        {showKeyHints && (
          <div className="absolute inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowKeyHints(false)}>
            <div className="text-center space-y-3">
              <div className="text-2xl font-bold text-white mb-4">Tangentbordsgenvagar</div>
              <div className="flex flex-col gap-2 text-lg" style={{ color: 'var(--color-text-secondary)' }}>
                <div><kbd className="px-2 py-1 rounded" style={{ background: 'var(--color-surface-raised)' }}>1-{focusModes.length}</kbd> Byt vy</div>
                <div><kbd className="px-2 py-1 rounded" style={{ background: 'var(--color-surface-raised)' }}>Ctrl +/-</kbd> Textstorlek</div>
                <div><kbd className="px-2 py-1 rounded" style={{ background: 'var(--color-surface-raised)' }}>Ctrl 0</kbd> Aterstall text</div>
                <div><kbd className="px-2 py-1 rounded" style={{ background: 'var(--color-surface-raised)' }}>Esc</kbd> Avsluta fokus</div>
              </div>
              <p className="text-sm mt-4" style={{ color: 'var(--color-text-muted)' }}>Klicka for att stanga</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-8 py-4 presentation-content">
          {children(focusMode)}
        </div>
      </div>
    );
  }

  // === NORMAL MODE ===
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold">{sessionTitle}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="font-mono text-indigo-400 font-bold">{sessionCode}</span>
              {isLive && <span className="badge-live">LIVE</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TextSizeControls />
          <button onClick={togglePresentation} className="btn-secondary text-sm py-2 px-3" title="Presentationslage (F11)">
            Fokus
          </button>
        </div>
      </div>

      {/* Focus mode selector */}
      <div className="focus-selector mb-5">
        {focusModes.map((mode, i) => (
          <button
            key={mode.key}
            onClick={() => setFocusMode(mode.key)}
            className={`focus-btn ${focusMode === mode.key ? 'focus-btn-active' : ''}`}
          >
            <span className="mr-1">{mode.icon}</span>
            <span className="hidden sm:inline">{mode.label}</span>
            <span className="sm:hidden">{mode.icon}</span>
            <span className="ml-1 text-xs opacity-40 hidden sm:inline">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* Content grid */}
      <div className={`grid gap-5 ${showSidebar && sidebarContent ? 'grid-cols-1 lg:grid-cols-[1fr_320px]' : 'grid-cols-1'}`}>
        <div className="min-h-[60vh] max-h-[72vh] overflow-y-auto card">
          {children(focusMode)}
        </div>

        {sidebarContent && (
          <div className="space-y-4 hidden lg:block">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="btn-ghost text-xs w-full"
            >
              {showSidebar ? 'Dolj sidopanel' : 'Visa sidopanel'}
            </button>
            {showSidebar && sidebarContent}
          </div>
        )}
      </div>
    </div>
  );
}
