'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface RecordingState {
  isRecording: boolean;
  duration: number; // seconds
  hasRecording: boolean;
  blob: Blob | null;
  blobUrl: string | null;
}

interface RecordingManagerProps {
  stream: MediaStream | null;
  sessionId: string;
  sessionTitle: string;
  autoStart?: boolean;
}

export function useRecording({ stream, sessionId, sessionTitle, autoStart = true }: RecordingManagerProps) {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    hasRecording: false,
    blob: null,
    blobUrl: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(() => {
    if (!stream || state.isRecording) return;

    chunksRef.current = [];

    // Try opus first, fall back to default
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      setState((s) => ({
        ...s,
        isRecording: false,
        hasRecording: true,
        blob,
        blobUrl,
      }));
    };

    recorder.start(1000); // 1s chunks
    mediaRecorderRef.current = recorder;
    startTimeRef.current = Date.now();

    // Duration timer
    timerRef.current = setInterval(() => {
      setState((s) => ({
        ...s,
        duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
      }));
    }, 1000);

    setState((s) => ({ ...s, isRecording: true, duration: 0 }));
  }, [stream, state.isRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [state.isRecording]);

  const downloadRecording = useCallback(() => {
    if (!state.blob) return;
    const ext = state.blob.type.includes('webm') ? 'webm' : 'ogg';
    const safeName = sessionTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 50);
    const filename = `${safeName}_${new Date().toISOString().slice(0, 10)}.${ext}`;

    const a = document.createElement('a');
    a.href = state.blobUrl!;
    a.download = filename;
    a.click();
  }, [state.blob, state.blobUrl, sessionTitle]);

  // Auto-start recording when stream becomes available
  useEffect(() => {
    if (autoStart && stream && !state.isRecording && !state.hasRecording) {
      // Defer to avoid synchronous setState in effect
      const id = requestAnimationFrame(() => startRecording());
      return () => cancelAnimationFrame(id);
    }
  }, [stream, autoStart, startRecording, state.isRecording, state.hasRecording]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
    };
  }, [state.blobUrl]);

  return {
    ...state,
    startRecording,
    stopRecording,
    downloadRecording,
  };
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Recording status badge + controls.
 * Shows: recording indicator with duration, download button after stop.
 */
export function RecordingControls({
  isRecording,
  hasRecording,
  duration,
  blobUrl,
  onStop,
  onDownload,
}: {
  isRecording: boolean;
  hasRecording: boolean;
  duration: number;
  blobUrl: string | null;
  onStop: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="card" style={{ padding: '0.75rem 1rem' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-danger)', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
              <span className="text-sm font-medium">Spelar in</span>
              <span className="text-sm font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatDuration(duration)}</span>
            </>
          ) : hasRecording ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-success)' }} />
              <span className="text-sm font-medium">Inspelning klar</span>
              <span className="text-sm font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatDuration(duration)}</span>
            </>
          ) : (
            <>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Ingen inspelning</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRecording && (
            <button onClick={onStop} className="btn-ghost text-xs" style={{ color: 'var(--color-danger)' }}>
              Stoppa
            </button>
          )}
          {hasRecording && (
            <>
              <button onClick={onDownload} className="btn-ghost text-xs" style={{ color: 'var(--color-accent)' }}>
                Ladda ner
              </button>
              {blobUrl && (
                <audio src={blobUrl} controls className="h-8 max-w-[160px]" style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.7 }} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
