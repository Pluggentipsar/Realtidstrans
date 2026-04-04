'use client';

import { useState } from 'react';
import { QuestionFocus, QUESTION_FOCUS_OPTIONS } from '@/types';

interface QuestionFocusSelectorProps {
  currentFocus: QuestionFocus;
  currentCount: number;
  onFocusChange: (focus: QuestionFocus) => void;
  onCountChange: (count: number) => void;
  compact?: boolean;
}

export function QuestionFocusSelector({
  currentFocus,
  currentCount,
  onFocusChange,
  onCountChange,
  compact = false,
}: QuestionFocusSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm"
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span>{QUESTION_FOCUS_OPTIONS.find((o) => o.key === currentFocus)?.icon}</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {QUESTION_FOCUS_OPTIONS.find((o) => o.key === currentFocus)?.label}
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
            {isExpanded ? '\u25B2' : '\u25BC'}
          </span>
        </button>

        {isExpanded && (
          <div
            className="absolute top-full left-0 mt-1 z-50 w-72 animate-slide-up"
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              padding: '0.5rem',
            }}
          >
            {QUESTION_FOCUS_OPTIONS.map((option) => (
              <button
                key={option.key}
                onClick={() => {
                  onFocusChange(option.key);
                  setIsExpanded(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg transition-all flex items-start gap-2.5"
                style={{
                  background: currentFocus === option.key ? 'var(--color-accent-subtle)' : 'transparent',
                  borderLeft: currentFocus === option.key ? '3px solid var(--color-accent)' : '3px solid transparent',
                }}
              >
                <span className="text-lg flex-shrink-0 mt-0.5">{option.icon}</span>
                <div>
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {option.description}
                  </div>
                </div>
              </button>
            ))}

            {/* Count selector */}
            <div
              className="mt-2 pt-2 px-3 pb-1 flex items-center justify-between"
              style={{ borderTop: '1px solid var(--color-border-subtle)' }}
            >
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Antal frågor per cykel
              </span>
              <div className="flex items-center gap-1">
                {[2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => onCountChange(n)}
                    className="w-7 h-7 rounded-md text-xs font-bold transition-all"
                    style={{
                      background: currentCount === n ? 'var(--color-accent)' : 'var(--color-surface-overlay)',
                      color: currentCount === n ? 'white' : 'var(--color-text-secondary)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full-size version for settings panel
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        Frågetyp
      </label>
      <div className="grid grid-cols-2 gap-2">
        {QUESTION_FOCUS_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => onFocusChange(option.key)}
            className="text-left p-3 rounded-lg transition-all"
            style={{
              background: currentFocus === option.key ? 'var(--color-accent-subtle)' : 'var(--color-surface-raised)',
              border: `1px solid ${currentFocus === option.key ? 'var(--color-accent)' : 'var(--color-border)'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span>{option.icon}</span>
              <span className="text-sm font-medium">{option.label}</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {option.description}
            </p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Antal frågor:
        </span>
        {[2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onCountChange(n)}
            className="w-8 h-8 rounded-lg text-sm font-bold transition-all"
            style={{
              background: currentCount === n ? 'var(--color-accent)' : 'var(--color-surface-raised)',
              color: currentCount === n ? 'white' : 'var(--color-text-secondary)',
              border: `1px solid ${currentCount === n ? 'var(--color-accent)' : 'var(--color-border)'}`,
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
