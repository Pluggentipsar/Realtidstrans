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
    <div className="max-w-xl mx-auto px-4 py-14">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-semibold tracking-tight mb-3" style={{ letterSpacing: '-0.02em' }}>Ljudprov</h1>
        <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
          Varje talare pratar i ~30 sekunder så systemet kan identifiera vem som säger vad.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {['Setup', 'Moderator', 'Ljudprov', 'Live'].map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium" style={{ background: i <= 2 ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)', color: i <= 2 ? 'white' : 'var(--color-text-muted)' }}>
              {i + 1}
            </div>
            <span className="text-[12px]" style={{ color: i <= 2 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{step}</span>
            {i < 3 && <div className="w-6 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />}
          </div>
        ))}
      </div>

      {/* Speaker list */}
      {speakers.length === 0 && (
        <div className="card text-center py-12">
          <p style={{ color: 'var(--color-text-muted)' }}>Inga talare inlagda i briefingen.</p>
          <p className="text-[13px] mt-2" style={{ color: 'var(--color-text-muted)' }}>Du kan lägga till talare i session setup.</p>
        </div>
      )}

      <div className="space-y-3">
        {speakers.map((speaker, idx) => (
          <div
            key={idx}
            className="card"
            style={{
              background: 'var(--glass-bg)',
              border: `1px solid ${speaker.status === 'recording' ? 'var(--color-danger)' : speaker.status === 'done' ? 'var(--color-success)' : 'var(--glass-border)'}`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              padding: '1rem 1.25rem',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: SPEAKER_COLORS[idx % SPEAKER_COLORS.length] }} />
                <div>
                  <span className="text-[14px] font-medium">{speaker.bio.name}</span>
                  {speaker.bio.title && (
                    <span className="text-[12px] ml-2" style={{ color: 'var(--color-text-muted)' }}>{speaker.bio.title}</span>
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
                      <span className="font-mono text-[13px]">{speaker.recordingSeconds}s</span>
                    </div>
                    <button
                      onClick={() => stopRecording(idx)}
                      disabled={speaker.recordingSeconds < minRecordingTime}
                      className="btn-danger text-xs py-1.5 px-3"
                    >
                      {speaker.recordingSeconds < minRecordingTime ? `Vänta ${minRecordingTime - speaker.recordingSeconds}s...` : 'Klart'}
                    </button>
                  </>
                )}
                {speaker.status === 'done' && (
                  <span className="text-[12px] font-medium" style={{ color: 'var(--color-success)' }}>&#x2713; Klar ({speaker.recordingSeconds}s)</span>
                )}
                {speaker.status === 'error' && (
                  <button onClick={() => startRecording(idx)} className="btn-secondary text-xs py-1.5 px-3">
                    Försök igen
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-8 space-y-3">
        <button onClick={proceedToLive} disabled={!allDone && speakers.length > 0} className="btn-primary w-full py-3">
          {allDone || speakers.length === 0 ? 'Tillbaka till moderator' : `${speakers.filter((s) => s.status === 'done').length}/${speakers.length} klara`}
        </button>
        <button
          onClick={() => {
            if (confirm('Hoppa över ljudprov? Talaridentifiering fungerar fortfarande men kan vara mindre precis.')) {
              skipSoundcheck();
            }
          }}
          className="btn-ghost w-full py-2 text-sm"
        >
          Hoppa över ljudprov
        </button>
        {speakers.some((s) => s.status === 'done') && !allDone && (
          <button
            onClick={() => {
              if (confirm(`${speakers.filter((s) => s.status !== 'done').length} talare har inte gjort ljudprov. Fortsätt ändå?`)) {
                proceedToLive();
              }
            }}
            className="btn-ghost w-full py-2 text-sm"
            style={{ color: 'var(--color-warning)' }}
          >
            Fortsätt med {speakers.filter((s) => s.status === 'done').length} av {speakers.length} klara
          </button>
        )}
      </div>
    </div>
  );
}
