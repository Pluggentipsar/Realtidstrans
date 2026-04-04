'use client';

import { useState, useEffect, ReactNode, useCallback } from 'react';
import { TextSizeControls, useTextSize } from './text-size-provider';

type FocusMode = 'transcript' | 'summary' | 'questions' | 'quotes' | 'audience';

interface PresentationViewProps {
  sessionId: string;
  sessionTitle: string;
  sessionCode: string;
  isLive: boolean;
  focusModes: Array<{ key: FocusMode; label: string; icon: string }>;
  children: (focusMode: FocusMode) => ReactNode;
  sidebarContent?: ReactNode;
  externalFocusMode?: string | null;
  externalSecondaryMode?: string | null;
}

export function PresentationView({
  sessionId,
  sessionTitle,
  sessionCode,
  isLive,
  focusModes,
  children,
  sidebarContent,
  externalFocusMode,
  externalSecondaryMode,
}: PresentationViewProps) {
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [showKeyHints, setShowKeyHints] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>(focusModes[0]?.key || 'transcript');
  const [secondaryMode, setSecondaryMode] = useState<FocusMode | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const { scale } = useTextSize();

  const isSplit = secondaryMode !== null;

  // React to moderator remote control — primary
  useEffect(() => {
    if (externalFocusMode && focusModes.some((m) => m.key === externalFocusMode)) {
      setFocusMode(externalFocusMode as FocusMode);
    }
  }, [externalFocusMode, focusModes]);

  // React to moderator remote control — secondary
  useEffect(() => {
    if (externalSecondaryMode === undefined) return;
    if (externalSecondaryMode === null) {
      setSecondaryMode(null);
    } else if (focusModes.some((m) => m.key === externalSecondaryMode)) {
      setSecondaryMode(externalSecondaryMode as FocusMode);
    }
  }, [externalSecondaryMode, focusModes]);

  // Toggle split: if already split, collapse. If single, split with a sensible default.
  const toggleSplit = useCallback(() => {
    if (isSplit) {
      setSecondaryMode(null);
    } else {
      // Pick next mode after current as default secondary
      const currentIdx = focusModes.findIndex((m) => m.key === focusMode);
      const nextIdx = (currentIdx + 1) % focusModes.length;
      setSecondaryMode(focusModes[nextIdx].key);
    }
  }, [isSplit, focusMode, focusModes]);

  // F11 or Escape to toggle presentation mode, number keys for mode switching
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'F11') {
        e.preventDefault();
        setIsPresentationMode((p) => !p);
      }
      if (e.key === 'Escape' && isPresentationMode) {
        setIsPresentationMode(false);
      }
      // Number keys 1-5 to switch primary focus mode
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

  // Compact mode selector for split panels
  const renderModeSelector = (activeMode: FocusMode, onSelect: (mode: FocusMode) => void, label?: string) => (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-xs mr-1" style={{ color: 'var(--color-text-muted)' }}>{label}</span>}
      {focusModes.map((mode) => (
        <button
          key={mode.key}
          onClick={() => onSelect(mode.key)}
          className="px-2 py-1 rounded-md text-xs transition-all"
          style={{
            background: activeMode === mode.key ? 'var(--color-accent)' : 'var(--color-surface-raised)',
            color: activeMode === mode.key ? 'white' : 'var(--color-text-secondary)',
            ...(isPresentationMode && activeMode === mode.key ? { boxShadow: '0 0 20px rgba(217,119,6,0.15)' } : {}),
          }}
          title={mode.label}
        >
          {mode.icon}
        </button>
      ))}
    </div>
  );

  // Split toggle button
  const splitButton = (
    <button
      onClick={toggleSplit}
      className="text-xs py-1.5 px-3 rounded-lg transition-all"
      style={{
        background: isSplit ? 'var(--color-accent)' : 'var(--color-surface-raised)',
        color: isSplit ? 'white' : 'var(--color-text-secondary)',
        border: `1px solid ${isSplit ? 'var(--color-accent)' : 'var(--color-border)'}`,
      }}
      title={isSplit ? 'Enkel vy' : 'Delad vy'}
    >
      {isSplit ? '⊞ Delad' : '⊞ Dela'}
    </button>
  );

  // === PRESENTATION MODE ===
  if (isPresentationMode) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'linear-gradient(180deg, #0a0a10 0%, #06060a 100%)' }}>
        {/* Minimal header */}
        <div className="presentation-header flex items-center justify-between flex-shrink-0 px-8 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', boxShadow: '0 1px 20px rgba(0,0,0,0.5)' }}>
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>{sessionTitle}</h1>
            {isLive && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
                <span className="badge-live">LIVE</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {splitButton}
            <TextSizeControls />
            <a
              href={`/session/${sessionId}/moderator`}
              className="text-xs px-2 py-1 rounded transition-all hover:opacity-80"
              style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface-raised)' }}
            >
              Moderator
            </a>
            <span className="text-sm font-mono" style={{ color: 'rgba(217,119,6,0.5)' }}>{sessionCode}</span>
            <button onClick={togglePresentation} className="btn-ghost text-sm">
              Esc
            </button>
          </div>
        </div>

        {/* Focus mode selector(s) */}
        <div className="px-8 py-4 flex-shrink-0">
          {isSplit ? (
            <div className="flex justify-center gap-6">
              {renderModeSelector(focusMode, setFocusMode, 'Vänster:')}
              <div style={{ width: '1px', background: 'var(--color-border)' }} />
              {renderModeSelector(secondaryMode!, (m) => setSecondaryMode(m), 'Höger:')}
            </div>
          ) : (
            <div className="focus-selector max-w-2xl mx-auto">
              {focusModes.map((mode, i) => (
                <button
                  key={mode.key}
                  onClick={() => setFocusMode(mode.key)}
                  className={`focus-btn ${focusMode === mode.key ? 'focus-btn-active' : ''}`}
                  style={focusMode === mode.key ? { boxShadow: '0 0 20px rgba(217,119,6,0.15)' } : undefined}
                >
                  <span className="mr-1.5">{mode.icon}</span>
                  {mode.label}
                  <span className="ml-1 text-xs opacity-50">{i + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Keyboard hints overlay */}
        {showKeyHints && (
          <div className="absolute inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(6,6,10,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setShowKeyHints(false)}>
            <div className="text-center space-y-3">
              <div className="text-2xl font-bold text-white mb-4">Tangentbordsgenvägar</div>
              <div className="flex flex-col gap-2 text-lg" style={{ color: 'var(--color-text-secondary)' }}>
                <div><kbd className="px-2 py-1 rounded" style={{ background: 'var(--color-surface-raised)' }}>1-{focusModes.length}</kbd> Byt vy</div>
                <div><kbd className="px-2 py-1 rounded" style={{ background: 'var(--color-surface-raised)' }}>Ctrl +/-</kbd> Textstorlek</div>
                <div><kbd className="px-2 py-1 rounded" style={{ background: 'var(--color-surface-raised)' }}>Ctrl 0</kbd> Återställ text</div>
                <div><kbd className="px-2 py-1 rounded" style={{ background: 'var(--color-surface-raised)' }}>Esc</kbd> Avsluta fokusläge</div>
              </div>
              <p className="text-sm mt-4" style={{ color: 'var(--color-text-muted)' }}>Klicka för att stänga</p>
            </div>
          </div>
        )}

        {/* Content — split or single */}
        {isSplit ? (
          <div className="flex-1 flex gap-1 px-4 py-4 min-h-0">
            <div className="flex-1 overflow-y-auto presentation-content px-4" style={{ borderRight: '1px solid rgba(255,255,255,0.03)', boxShadow: '1px 0 20px rgba(0,0,0,0.3)' }}>
              {children(focusMode)}
            </div>
            <div className="flex-1 overflow-y-auto presentation-content px-4">
              {children(secondaryMode!)}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-8 py-4 presentation-content" style={{ maxWidth: '75ch', margin: '0 auto' }}>
            {children(focusMode)}
          </div>
        )}
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
          <a
            href={`/session/${sessionId}/moderator`}
            className="btn-ghost text-sm"
          >
            Moderator
          </a>
          {splitButton}
          <TextSizeControls />
          <button onClick={togglePresentation} className="btn-secondary text-sm py-2 px-3" title="Presentationsläge (F11)">
            Fokus
          </button>
        </div>
      </div>

      {/* Focus mode selector(s) */}
      {isSplit ? (
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          {renderModeSelector(focusMode, setFocusMode, 'Vänster:')}
          <div style={{ width: '1px', height: '24px', background: 'var(--color-border)' }} />
          {renderModeSelector(secondaryMode!, (m) => setSecondaryMode(m), 'Höger:')}
        </div>
      ) : (
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
      )}

      {/* Content grid */}
      <div className={`grid gap-5 ${showSidebar && sidebarContent ? (isSplit ? 'grid-cols-1 lg:grid-cols-[1fr_1fr_320px]' : 'grid-cols-1 lg:grid-cols-[1fr_320px]') : (isSplit ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}`}>
        <div className="min-h-[60vh] max-h-[72vh] overflow-y-auto card" style={isSplit ? { borderRight: '1px solid rgba(255,255,255,0.04)' } : undefined}>
          {children(focusMode)}
        </div>

        {isSplit && (
          <div className="min-h-[60vh] max-h-[72vh] overflow-y-auto card">
            {children(secondaryMode!)}
          </div>
        )}

        {sidebarContent && (
          <div className="space-y-4 hidden lg:block">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="btn-ghost text-xs w-full"
            >
              {showSidebar ? 'Dölj sidopanel' : 'Visa sidopanel'}
            </button>
            {showSidebar && sidebarContent}
          </div>
        )}
      </div>
    </div>
  );
}
