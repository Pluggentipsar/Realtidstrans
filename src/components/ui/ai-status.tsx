'use client';

import { useState, useEffect, useCallback } from 'react';

// AI processing states
export type AIProcessState =
  | 'idle'
  | 'listening'
  | 'summarizing'
  | 'generating_questions'
  | 'extracting_quotes'
  | 'detecting_topic'
  | 'analyzing_gaps'
  | 'clustering';

interface StatusConfig {
  label: string;
  icon: string;
  color: string;
  pulse: boolean;
}

const STATUS_MAP: Record<AIProcessState, StatusConfig> = {
  idle: { label: '', icon: '', color: '', pulse: false },
  listening: { label: 'Lyssnar', icon: '\uD83C\uDFA4', color: 'var(--color-accent)', pulse: true },
  summarizing: { label: 'Sammanfattar', icon: '\u2728', color: '#a78bfa', pulse: true },
  generating_questions: { label: 'Genererar fragor', icon: '\uD83E\uDDE0', color: '#f472b6', pulse: true },
  extracting_quotes: { label: 'Extraherar citat', icon: '\uD83D\uDCAC', color: '#fbbf24', pulse: true },
  detecting_topic: { label: 'Analyserar amne', icon: '\uD83D\uDD0D', color: '#34d399', pulse: true },
  analyzing_gaps: { label: 'Analyserar luckor', icon: '\uD83E\uDDE9', color: '#fb923c', pulse: true },
  clustering: { label: 'Grupperar fragor', icon: '\uD83D\uDCCA', color: '#60a5fa', pulse: true },
};

interface AIStatusBarProps {
  states: AIProcessState[];
  compact?: boolean;
}

/**
 * Shows current AI processing status with animated indicators.
 * Can show multiple simultaneous states (e.g. summarizing + extracting quotes).
 */
export function AIStatusBar({ states, compact = false }: AIStatusBarProps) {
  const activeStates = states.filter((s) => s !== 'idle');

  if (activeStates.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 overflow-x-auto animate-fade-in"
      style={{
        padding: compact ? '0.4rem 0.75rem' : '0.6rem 1rem',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {/* Animated orb */}
      <div className="flex-shrink-0">
        <AIOrb colors={activeStates.map((s) => STATUS_MAP[s].color)} />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {activeStates.map((state) => {
          const config = STATUS_MAP[state];
          return (
            <div
              key={state}
              className="flex items-center gap-1.5 whitespace-nowrap animate-slide-up"
              style={{ fontSize: compact ? '0.75rem' : '0.85rem' }}
            >
              <span>{config.icon}</span>
              <span style={{ color: config.color }}>{config.label}</span>
              <ProcessingDots color={config.color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Animated processing dots (...)
 */
function ProcessingDots({ color }: { color: string }) {
  return (
    <span className="inline-flex gap-[2px] ml-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1 h-1 rounded-full"
          style={{
            background: color,
            animation: `processing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Animated orb that represents AI activity.
 * Changes color based on active processes.
 */
function AIOrb({ colors }: { colors: string[] }) {
  const primaryColor = colors[0] || 'var(--color-accent)';

  return (
    <div className="relative w-6 h-6 flex-shrink-0">
      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: primaryColor,
          opacity: 0.2,
          animation: 'ai-orb-glow 2s ease-in-out infinite',
        }}
      />
      {/* Inner orb */}
      <div
        className="absolute inset-1 rounded-full"
        style={{
          background: `radial-gradient(circle at 40% 40%, ${primaryColor}, ${adjustAlpha(primaryColor, 0.4)})`,
          animation: 'ai-orb-pulse 1.5s ease-in-out infinite',
        }}
      />
      {/* Highlight */}
      <div
        className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full"
        style={{ background: 'rgba(255,255,255,0.4)' }}
      />
    </div>
  );
}

/**
 * Notification toast for completed AI operations.
 */
interface AINotification {
  id: string;
  type: 'summary' | 'questions' | 'quotes' | 'topic_shift' | 'gap_analysis' | 'clusters';
  message: string;
  timestamp: number;
}

const NOTIFICATION_CONFIG: Record<AINotification['type'], { icon: string; color: string }> = {
  summary: { icon: '\u2728', color: '#a78bfa' },
  questions: { icon: '\uD83E\uDDE0', color: '#f472b6' },
  quotes: { icon: '\uD83D\uDCAC', color: '#fbbf24' },
  topic_shift: { icon: '\uD83D\uDD04', color: '#34d399' },
  gap_analysis: { icon: '\uD83E\uDDE9', color: '#fb923c' },
  clusters: { icon: '\uD83D\uDCCA', color: '#60a5fa' },
};

export function useAINotifications() {
  const [notifications, setNotifications] = useState<AINotification[]>([]);

  const addNotification = useCallback((type: AINotification['type'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setNotifications((prev) => [...prev, { id, type, message, timestamp: Date.now() }]);

    // Auto-dismiss after 5s
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  return { notifications, addNotification };
}

export function AINotificationStack({ notifications }: { notifications: AINotification[] }) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((n) => {
        const config = NOTIFICATION_CONFIG[n.type];
        return (
          <div
            key={n.id}
            className="animate-slide-up"
            style={{
              background: 'var(--color-surface-raised)',
              border: `1px solid ${adjustAlpha(config.color, 0.3)}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 12px ${adjustAlpha(config.color, 0.1)}`,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{config.icon}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: config.color }}>{n.message}</p>
              </div>
            </div>
            {/* Progress bar that shrinks over 5s */}
            <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-overlay)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  background: config.color,
                  animation: 'notification-shrink 5s linear forwards',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function adjustAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}
