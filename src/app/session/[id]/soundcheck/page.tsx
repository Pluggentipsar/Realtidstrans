'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Speaker, SPEAKER_COLORS, SpeakerBio } from '@/types';
import { generateId } from '@/lib/utils';

interface SoundcheckSpeaker {
  bio: SpeakerBio;
  status: 'waiting' | 'recording' | 'done' | 'error';
  voiceProfileId?: string;
  linkedSpeakerId?: string;
  recordingSeconds: number;
}

export default function SoundcheckPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<{ title: string; briefing: { speakerBios: SpeakerBio[] } } | null>(null);
  const [speakers, setSpeakers] = useState<SoundcheckSpeaker[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load session data
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((s) => {
        setSession(s);
        setSpeakers(
          (s.briefing?.speakerBios || []).map((bio: SpeakerBio) => ({
            bio,
            status: 'waiting' as const,
            recordingSeconds: 0,
          }))
        );
        setIsLoaded(true);
      })
      .catch(console.error);
  }, [sessionId]);

  const startRecording = useCallback(async (idx: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      setSpeakers((prev) => prev.map((s, i) => i === idx ? { ...s, status: 'recording', recordingSeconds: 0 } : s));
      setActiveSpeaker(idx);

      // Timer for countdown
      let seconds = 0;
      timerRef.current = setInterval(() => {
        seconds++;
        setSpeakers((prev) => prev.map((s, i) => i === idx ? { ...s, recordingSeconds: seconds } : s));
      }, 1000);

    } catch {
      setSpeakers((prev) => prev.map((s, i) => i === idx ? { ...s, status: 'error' } : s));
    }
  }, []);

  const stopRecording = useCallback((idx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Mark as done (in production, this would send audio to VoiceEnrollment API)
    const speakerId = generateId();
    setSpeakers((prev) => prev.map((s, i) => i === idx ? {
      ...s,
      status: 'done',
      linkedSpeakerId: speakerId,
    } : s));
    setActiveSpeaker(null);

    // Register speaker with session
    const speaker = speakers[idx];
    fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addSpeaker: {
          id: speakerId,
          name: speaker.bio.name,
          role: 'guest',
          color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
        },
      }),
    }).catch(console.error);
  }, [sessionId, speakers]);

  const skipSoundcheck = useCallback(() => {
    // Register all speakers without voice profiles
    const promises = speakers.map((s, idx) => {
      if (s.status === 'done') return Promise.resolve();
      return fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addSpeaker: {
            id: generateId(),
            name: s.bio.name,
            role: 'guest',
            color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
          },
        }),
      });
    });
    Promise.all(promises).then(() => {
      fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'live' }) });
      router.push(`/session/${sessionId}/moderator`);
    });
  }, [sessionId, speakers, router]);

  const proceedToLive = useCallback(() => {
    fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'soundcheck' }) });
    router.push(`/session/${sessionId}/moderator`);
  }, [sessionId, router]);

  if (!isLoaded) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div style={{ color: 'var(--color-text-muted)' }}>Laddar...</div></div>;
  }

  const allDone = speakers.every((s) => s.status === 'done');
  const minRecordingTime = 10; // Minimum seconds for useful voice enrollment

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Ljudprov</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Varje talare pratar i ~30 sekunder sa systemet kan identifiera vem som sager vad.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {['Setup', 'Ljudprov', 'Live'].map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: i <= 1 ? 'var(--color-accent)' : 'var(--color-surface-raised)', color: i <= 1 ? 'white' : 'var(--color-text-muted)' }}>
              {i + 1}
            </div>
            <span className="text-sm" style={{ color: i <= 1 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{step}</span>
            {i < 2 && <div className="w-8 h-px" style={{ background: 'var(--color-border)' }} />}
          </div>
        ))}
      </div>

      {/* Speaker list */}
      {speakers.length === 0 && (
        <div className="card text-center py-10">
          <p style={{ color: 'var(--color-text-muted)' }}>Inga talare inlagda i briefingen.</p>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>Du kan lagga till talare i session setup.</p>
        </div>
      )}

      <div className="space-y-3">
        {speakers.map((speaker, idx) => (
          <div
            key={idx}
            className="card"
            style={{
              borderColor: speaker.status === 'recording' ? 'var(--color-danger)' : speaker.status === 'done' ? 'var(--color-success)' : 'var(--color-border-subtle)',
              padding: '1rem 1.25rem',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: SPEAKER_COLORS[idx % SPEAKER_COLORS.length] }} />
                <div>
                  <span className="font-medium">{speaker.bio.name}</span>
                  {speaker.bio.title && (
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{speaker.bio.title}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {speaker.status === 'waiting' && (
                  <button
                    onClick={() => startRecording(idx)}
                    disabled={activeSpeaker !== null}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    Starta ljudprov
                  </button>
                )}
                {speaker.status === 'recording' && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-danger)', animation: 'pulse-live 1s ease-in-out infinite' }} />
                      <span className="font-mono text-sm">{speaker.recordingSeconds}s</span>
                    </div>
                    <button
                      onClick={() => stopRecording(idx)}
                      disabled={speaker.recordingSeconds < minRecordingTime}
                      className="btn-danger text-xs py-1.5 px-3"
                    >
                      {speaker.recordingSeconds < minRecordingTime ? `Vanta ${minRecordingTime - speaker.recordingSeconds}s...` : 'Klart'}
                    </button>
                  </>
                )}
                {speaker.status === 'done' && (
                  <span className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>&#x2713; Klar ({speaker.recordingSeconds}s)</span>
                )}
                {speaker.status === 'error' && (
                  <button onClick={() => startRecording(idx)} className="btn-secondary text-xs py-1.5 px-3">
                    Forsok igen
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-8 flex gap-3">
        <button onClick={skipSoundcheck} className="btn-ghost flex-1 py-3 text-sm">
          Hoppa over ljudprov
        </button>
        <button onClick={proceedToLive} disabled={!allDone && speakers.length > 0} className="btn-primary flex-1 py-3">
          {allDone || speakers.length === 0 ? 'Ga till sessionen' : `${speakers.filter((s) => s.status === 'done').length}/${speakers.length} klara`}
        </button>
      </div>
    </div>
  );
}
