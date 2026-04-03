'use client';

import { SpeakerAnalytics, QuestionTarget, QUESTION_TARGET_OPTIONS } from '@/types';

interface LiveSpeakerBarProps {
  analytics: SpeakerAnalytics[];
  speakerColors: Record<string, string>;
  questionTarget: QuestionTarget;
  specificSpeaker?: string;
  onTargetChange: (target: QuestionTarget, specificSpeaker?: string) => void;
}

export function LiveSpeakerBar({
  analytics,
  speakerColors,
  questionTarget,
  specificSpeaker,
  onTargetChange,
}: LiveSpeakerBarProps) {
  if (analytics.length === 0) return null;

  const totalWords = analytics.reduce((sum, s) => sum + s.wordCount, 0);
  const totalTime = analytics.reduce((sum, s) => sum + s.totalSpeakingTimeMs, 0);

  return (
    <div className="card" style={{ padding: '0.75rem 1rem' }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Talartid
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {totalWords} ord totalt
        </span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-3" style={{ background: 'var(--color-surface-overlay)' }}>
        {analytics.map((speaker) => (
          <div
            key={speaker.speakerId}
            className="h-full transition-all duration-1000 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${speaker.speakingPercentage}%`,
              background: speakerColors[speaker.speakerId] || 'var(--color-accent)',
              opacity: 0.85,
            }}
            title={`${speaker.speakerName}: ${speaker.speakingPercentage.toFixed(0)}%`}
          />
        ))}
      </div>

      {/* Speaker list */}
      <div className="space-y-1.5">
        {analytics.map((speaker) => {
          const color = speakerColors[speaker.speakerId] || 'var(--color-accent)';
          const isTarget = questionTarget === 'specific' && specificSpeaker === speaker.speakerName;
          const isLeastActive = questionTarget === 'least_active' && speaker.speakerId === analytics[analytics.length - 1]?.speakerId;
          const isMostActive = questionTarget === 'most_active' && speaker.speakerId === analytics[0]?.speakerId;
          const highlighted = isTarget || isLeastActive || isMostActive;

          return (
            <button
              key={speaker.speakerId}
              onClick={() => {
                if (questionTarget === 'specific' && specificSpeaker === speaker.speakerName) {
                  onTargetChange('anyone');
                } else {
                  onTargetChange('specific', speaker.speakerName);
                }
              }}
              className="w-full flex items-center gap-2 py-1 px-1.5 rounded-md transition-all text-left"
              style={{
                background: highlighted ? 'var(--color-accent-subtle)' : 'transparent',
                border: highlighted ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
              }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-xs font-medium flex-1 truncate">{speaker.speakerName}</span>
              <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {speaker.speakingPercentage.toFixed(0)}%
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {speaker.wordCount}w
              </span>
              {highlighted && (
                <span className="text-xs" style={{ color: 'var(--color-accent)' }}>
                  &#x1F3AF;
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Target selector */}
      <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-center gap-1">
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            Rikta fragor till:
          </span>
          <div className="flex gap-1 flex-wrap">
            {QUESTION_TARGET_OPTIONS.filter((o) => o.key !== 'specific').map((option) => (
              <button
                key={option.key}
                onClick={() => onTargetChange(option.key)}
                className="px-2 py-0.5 rounded-md text-xs transition-all"
                style={{
                  background: questionTarget === option.key ? 'var(--color-accent)' : 'var(--color-surface-overlay)',
                  color: questionTarget === option.key ? 'white' : 'var(--color-text-secondary)',
                }}
                title={option.description}
              >
                {option.icon} {option.label}
              </button>
            ))}
          </div>
        </div>
        {questionTarget === 'specific' && specificSpeaker && (
          <div className="mt-1 text-xs" style={{ color: 'var(--color-accent)' }}>
            &#x1F3AF; Riktar fragor till: {specificSpeaker}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact version for presentation mode sidebar
 */
export function SpeakerTimeCompact({
  analytics,
  speakerColors,
}: {
  analytics: SpeakerAnalytics[];
  speakerColors: Record<string, string>;
}) {
  if (analytics.length === 0) return null;

  return (
    <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-overlay)' }}>
      {analytics.map((s) => (
        <div
          key={s.speakerId}
          className="h-full transition-all duration-1000"
          style={{
            width: `${s.speakingPercentage}%`,
            background: speakerColors[s.speakerId] || 'var(--color-accent)',
          }}
          title={`${s.speakerName}: ${s.speakingPercentage.toFixed(0)}%`}
        />
      ))}
    </div>
  );
}
