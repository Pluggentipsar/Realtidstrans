'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface TextSizeContextType {
  scale: number;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
  setScale: (s: number) => void;
}

const TextSizeContext = createContext<TextSizeContextType>({
  scale: 1,
  increase: () => {},
  decrease: () => {},
  reset: () => {},
  setScale: () => {},
});

export function useTextSize() {
  return useContext(TextSizeContext);
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 3.0;
const STEP = 0.15;

export function TextSizeProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState(1);

  const applyScale = useCallback((s: number) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    setScaleState(clamped);
    document.documentElement.style.setProperty('--text-scale', String(clamped));
  }, []);

  const increase = useCallback(() => applyScale(scale + STEP), [scale, applyScale]);
  const decrease = useCallback(() => applyScale(scale - STEP), [scale, applyScale]);
  const reset = useCallback(() => applyScale(1), [applyScale]);

  // Keyboard shortcuts: Ctrl/Cmd + Plus/Minus/0
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          increase();
        } else if (e.key === '-') {
          e.preventDefault();
          decrease();
        } else if (e.key === '0') {
          e.preventDefault();
          reset();
        }
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [increase, decrease, reset]);

  return (
    <TextSizeContext.Provider value={{ scale, increase, decrease, reset, setScale: applyScale }}>
      {children}
    </TextSizeContext.Provider>
  );
}

/** Compact +/- controls */
export function TextSizeControls() {
  const { scale, increase, decrease, reset } = useTextSize();

  return (
    <div className="text-size-controls">
      <button onClick={decrease} className="text-size-btn" title="Minska text (Ctrl+-)">
        -
      </button>
      <button onClick={reset} className="text-size-label cursor-pointer" title="Återställ (Ctrl+0)">
        {Math.round(scale * 100)}%
      </button>
      <button onClick={increase} className="text-size-btn" title="Förstora text (Ctrl++)">
        +
      </button>
    </div>
  );
}
