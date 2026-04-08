'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { getSocket } from '@/lib/socket';
import { AudioCapture } from '@/lib/audio-capture';
import { useRecording, RecordingControls } from '@/components/ui/recording-manager';
import {
  Session,
  TranscriptSegment,
  AISummary,
  AIQuestion,
  AudienceQuestion,
  QuestionCluster,
  QuotableMoment,
  Poll,
  PollOption,
  EngagementSnapshot,
  SpeakerAnalytics,
  ReactionBurst,
  QUESTION_CATEGORY_LABELS,
  QUOTE_CATEGORY_LABELS,
  REACTION_EMOJIS,
  QuestionFocus,
  QuestionTarget,
  QUESTION_FOCUS_OPTIONS,
  PreparedQuestion,
} from '@/types';
import { formatTimestamp } from '@/lib/utils';
import { ExportPanel } from '@/components/ui/export-panel';

export default function ModeratorPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [summaries, setSummaries] = useState<AISummary[]>([]);
  const [aiQuestions, setAiQuestions] = useState<AIQuestion[]>([]);
  const [audienceQuestions, setAudienceQuestions] = useState<AudienceQuestion[]>([]);
  const [clusters, setClusters] = useState<QuestionCluster[]>([]);
  const [quotes, setQuotes] = useState<QuotableMoment[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [engagement, setEngagement] = useState<EngagementSnapshot | null>(null);
  const [speakerAnalytics, setSpeakerAnalytics] = useState<SpeakerAnalytics[]>([]);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);

  // Recording
  const recording = useRecording({
    stream: audioStream,
    sessionId,
    sessionTitle: session?.title || 'session',
  });

  // Moderator state
  const [questionFocus, setQuestionFocus] = useState<QuestionFocus>('balanced');
  const [questionTarget, setQuestionTarget] = useState<QuestionTarget>('anyone');
  // Persist dismiss/highlight state in localStorage so page refresh doesn't lose triage
  const [dismissedAiIds, setDismissedAiIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(`dismissed_${sessionId}`) || '[]')); } catch { return new Set(); }
  });
  const [highlightedAiIds, setHighlightedAiIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(`highlighted_${sessionId}`) || '[]')); } catch { return new Set(); }
  });

  useEffect(() => {
    localStorage.setItem(`dismissed_${sessionId}`, JSON.stringify([...dismissedAiIds]));
  }, [dismissedAiIds, sessionId]);
  useEffect(() => {
    localStorage.setItem(`highlighted_${sessionId}`, JSON.stringify([...highlightedAiIds]));
  }, [highlightedAiIds, sessionId]);
  const [projectorView, setProjectorView] = useState('transcript');
  const [projectorSecondary, setProjectorSecondary] = useState<string | null>(null);
  const [showAdvancedProjector, setShowAdvancedProjector] = useState(false);

  const [leftView, setLeftView] = useState<'transcript' | 'summary' | 'quotes'>('transcript');
  const [questionSuggestion, setQuestionSuggestion] = useState<{ suggestedQuestionId: string; reasoning: string; confidence: number } | null>(null);

  // Poll creation
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`).then((r) => r.json()).then((s) => { setSession(s); setIsLive(s.status === 'live'); }).catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    const socket = socketRef.current;
    socket.emit('session:join', { sessionId, role: 'host' });

    socket.on('transcript:partial', (seg) => {
      setTranscript((prev) => {
        const idx = prev.findIndex((s) => !s.isFinal && s.speakerId === seg.speakerId);
        if (idx >= 0) { const u = [...prev]; u[idx] = seg; return u; }
        return [...prev, seg];
      });
    });
    socket.on('transcript:final', (seg) => {
      setTranscript((prev) => [...prev.filter((s) => !(!s.isFinal && s.speakerId === seg.speakerId)), seg]);
    });
    socket.on('ai:summary', (s) => setSummaries((p) => [...p, s]));
    socket.on('ai:questions', (q) => setAiQuestions((p) => [...p, ...q]));
    socket.on('ai:quotes', (q) => setQuotes((p) => [...p, ...q]));
    socket.on('audience:question_added', (q) => setAudienceQuestions((p) => [...p, q]));
    socket.on('audience:question_voted', ({ questionId, votes }) => {
      setAudienceQuestions((p) => p.map((q) => q.id === questionId ? { ...q, votes } : q));
    });
    socket.on('audience:clusters_updated', setClusters);
    socket.on('poll:created', (p) => setPolls((prev) => [...prev, p]));
    socket.on('poll:updated', (p) => setPolls((prev) => prev.map((x) => x.id === p.id ? p : x)));
    socket.on('poll:closed', (p) => setPolls((prev) => prev.map((x) => x.id === p.id ? p : x)));
    socket.on('engagement:update', setEngagement);
    socket.on('speakers:analytics', setSpeakerAnalytics);
    socket.on('reaction:burst', (b) => setReactionBursts((p) => [...p.slice(-10), b]));
    socket.on('session:status_changed', (status) => {
      setSession((p) => p ? { ...p, status } : p);
      setIsLive(status === 'live');
    });
    socket.on('session:speaker_identified', (speaker) => {
      setSession((p) => p ? { ...p, speakers: [...p.speakers.filter(s => s.id !== speaker.id), speaker] } : p);
    });
    socket.on('session:error', (err) => {
      console.error('Session error:', err);
      setAudioError(err.message || 'Ett fel uppstod');
    });

    socket.on('agenda:item_updated', ({ itemId, status }) => {
      setSession((p) => {
        if (!p?.briefing?.agenda) return p;
        return { ...p, briefing: { ...p.briefing, agenda: p.briefing.agenda.map((a) => a.id === itemId ? { ...a, status, ...(status === 'in_progress' ? { startedAt: Date.now() } : {}), ...(status === 'done' ? { completedAt: Date.now() } : {}) } : a) } };
      });
    });
    socket.on('agenda:current_detected', ({ itemId, confidence, reason }) => {
      console.log(`AI detected agenda item ${itemId} (${confidence}): ${reason}`);
    });
    socket.on('ai:question_suggestion', (data) => {
      setQuestionSuggestion(data);
    });

    return () => { socket.emit('session:leave', sessionId); socket.removeAllListeners(); };
  }, [sessionId]);

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);

  // Moderator actions
  const highlightQuestion = useCallback((id: string, source: 'ai' | 'audience') => {
    socketRef.current.emit('moderator:highlight_question', { sessionId, questionId: id, source });
    if (source === 'ai') setHighlightedAiIds((p) => new Set(p).add(id));
  }, [sessionId]);

  const dismissQuestion = useCallback((id: string, source: 'ai' | 'audience') => {
    socketRef.current.emit('moderator:dismiss_question', { sessionId, questionId: id, source });
    if (source === 'ai') setDismissedAiIds((p) => new Set(p).add(id));
  }, [sessionId]);

  const setProjector = useCallback((view: string, secondary?: string | null) => {
    setProjectorView(view);
    setProjectorSecondary(secondary ?? null);
    socketRef.current.emit('moderator:set_projector_view', { sessionId, view, secondary: secondary || undefined });
  }, [sessionId]);

  const changeFocus = useCallback((focus: QuestionFocus) => {
    setQuestionFocus(focus);
    socketRef.current.emit('settings:update_question_focus', { sessionId, focus });
  }, [sessionId]);

  const startSession = useCallback(async () => {
    setAudioError(null);
    try {
      const ac = new AudioCapture();
      audioCaptureRef.current = ac;
      await ac.start((chunk) => socketRef.current.emit('audio:chunk', { sessionId, chunk }));
      setAudioStream(ac.getStream());
      // Update status via REST API so all clients (including projector) see it
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'live' }),
      });
      socketRef.current.emit('transcription:start', sessionId);
      setIsLive(true);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Mikrofonbehörighet nekad. Tillåt mikrofon i webbläsaren.'
        : 'Kunde inte starta mikrofon. Kontrollera att en mikrofon är ansluten.';
      setAudioError(msg);
    }
  }, [sessionId]);

  const stopSession = useCallback(() => {
    recording.stopRecording();
    audioCaptureRef.current?.stop();
    setAudioStream(null);
    audioCaptureRef.current = null;
    socketRef.current.emit('transcription:stop', sessionId);
    fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ended' }),
    }).catch(() => {});
    setIsLive(false);
  }, [sessionId, recording]);

  const changeTarget = useCallback((target: QuestionTarget) => {
    setQuestionTarget(target);
    socketRef.current.emit('settings:update_question_target', { sessionId, target });
  }, [sessionId]);

  const updateAgendaItem = useCallback((itemId: string, status: 'upcoming' | 'in_progress' | 'done') => {
    socketRef.current.emit('moderator:update_agenda_item', { sessionId, itemId, status });
    fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agendaItemUpdate: { itemId, status } }),
    }).catch(() => {});
  }, [sessionId]);

  const [pollError, setPollError] = useState('');
  const createPoll = useCallback(() => {
    const validOptions = pollOptions.filter((o) => o.trim());
    if (!pollQuestion.trim()) { setPollError('Ange en fråga'); return; }
    if (validOptions.length < 2) { setPollError('Minst 2 alternativ krävs'); return; }
    setPollError('');
    socketRef.current.emit('poll:create', { sessionId, question: pollQuestion, options: validOptions });
    setPollQuestion(''); setPollOptions(['', '']); setShowPollForm(false);
  }, [sessionId, pollQuestion, pollOptions]);

  if (!session) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div style={{ color: 'var(--color-text-muted)' }}>Laddar...</div></div>;
  }

  // Filter AI questions by status
  const activeAiQuestions = aiQuestions.filter((q) => !dismissedAiIds.has(q.id));
  const newAiQuestions = activeAiQuestions.filter((q) => !highlightedAiIds.has(q.id));
  const pickedAiQuestions = activeAiQuestions.filter((q) => highlightedAiIds.has(q.id));

  // Sorted audience questions
  const sortedAudienceQs = [...audienceQuestions].sort((a, b) => b.votes - a.votes);
  const latestSummary = summaries[summaries.length - 1];

  const speakerColors = Object.fromEntries(session.speakers.map((s) => [s.id, s.color]));

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-11 flex-shrink-0" style={{ background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.04)', borderTop: '2px solid var(--color-accent)' }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">{session.title}</span>
          <span className="text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded" style={{ color: 'var(--color-accent)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(217,119,6,0.1)' }}>MODERATOR</span>
          {isLive && <span className="badge-live text-xs">LIVE</span>}
          <button
            onClick={() => navigator.clipboard.writeText(session.code)}
            className="font-mono text-sm font-bold px-2 py-0.5 rounded transition-all hover:opacity-70"
            style={{ color: 'var(--color-accent)', background: 'var(--color-accent-subtle)' }}
            title="Klicka för att kopiera sessionskod"
          >
            {session.code}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {engagement && (
            <span className="text-xs" style={{ color: engagement.temperature > 60 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
              Temp: {engagement.temperature} {engagement.temperature < 30 ? '(lugnt)' : engagement.temperature < 70 ? '(engagerat)' : '(intensivt)'}
            </span>
          )}
          {!isLive ? (
            <>
              {session.briefing?.speakerBios && session.briefing.speakerBios.length > 0 && (
                <a href={`/session/${sessionId}/soundcheck`} className="btn-ghost text-xs">Ljudprov</a>
              )}
              <button onClick={startSession} className="btn-primary text-xs py-1.5 px-3">Starta session</button>
            </>
          ) : (
            <button onClick={stopSession} className="btn-danger text-xs py-1.5 px-3">Avsluta</button>
          )}
          <a
            href={`/session/${sessionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs py-1.5 px-3 rounded-lg font-medium transition-all"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            &#x1F4FA; Öppna projektorvy
          </a>
          <a href={`/session/${sessionId}/dashboard`} className="btn-ghost text-xs">Dashboard</a>
        </div>
      </div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-[1fr_380px_320px] h-[calc(100%-2.75rem)] gap-0">

        {/* LEFT: Live transcript */}
        <div className="overflow-y-auto p-4" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              {[
                { key: 'transcript' as const, label: 'Transkript' },
                { key: 'summary' as const, label: `Sammanfattning (${summaries.length})` },
                { key: 'quotes' as const, label: `Citat (${quotes.length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setLeftView(tab.key)}
                  className="px-2 py-1 rounded-md text-xs transition-all"
                  style={{
                    background: leftView === tab.key ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)',
                    color: leftView === tab.key ? 'white' : 'var(--color-text-muted)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Speaker time bar */}
            {speakerAnalytics.length > 0 && (
              <div className="flex items-center gap-2">
                {speakerAnalytics.map((s) => (
                  <div key={s.speakerId} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: speakerColors[s.speakerId] || 'var(--color-accent)' }} />
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.speakerName.split(' ')[0]} {s.speakingPercentage.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {leftView === 'transcript' && (
            <>
              {/* Latest summary banner */}
              {latestSummary && (
                <div className="mb-3 p-3 rounded-lg animate-fade-in" style={{ background: 'var(--color-accent-subtle)', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-accent)' }}>Senaste sammanfattning</div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{latestSummary.content.slice(0, 250)}...</p>
                </div>
              )}

              <div className="space-y-0.5">
                {transcript.slice(-50).map((seg) => (
                  <div key={seg.id} className={`transcript-line text-sm ${!seg.isFinal ? 'opacity-40' : ''}`} style={seg.isFinal ? { borderLeftColor: speakerColors[seg.speakerId] || 'var(--color-accent)' } : {}}>
                    <span className="speaker-name text-xs" style={{ color: speakerColors[seg.speakerId] || 'var(--color-accent)' }}>{seg.speakerName}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{formatTimestamp(seg.timestamp)}</span>
                    <p className="leading-relaxed">{seg.text}</p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </>
          )}

          {leftView === 'summary' && (
            <div className="space-y-4">
              {summaries.length === 0 && <p className="text-center py-10 text-xs" style={{ color: 'var(--color-text-muted)' }}>Inga sammanfattningar ännu</p>}
              {summaries.map((s) => (
                <div key={s.id} className="animate-slide-up" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '1rem' }}>
                  <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    {s.topicLabel && <span className="badge-accent">{s.topicLabel}</span>}
                  </div>
                  <div className="leading-relaxed prose prose-invert prose-xs max-w-none text-sm">
                    <ReactMarkdown>{s.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          )}

          {leftView === 'quotes' && (
            <div className="space-y-3">
              {quotes.length === 0 && <p className="text-center py-10 text-xs" style={{ color: 'var(--color-text-muted)' }}>Inga citat ännu</p>}
              {quotes.sort((a, b) => b.impactScore - a.impactScore).map((q) => (
                <div key={q.id} className="quote-block" style={{ padding: '0.5rem 0.75rem', margin: '0.25rem 0' }}>
                  <p className="text-sm italic">&ldquo;{q.quote}&rdquo;</p>
                  <span className="text-xs" style={{ color: 'var(--color-accent)' }}>— {q.speakerName}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MIDDLE: AI Questions + Quotes (the moderator's main tool) */}
        <div className="overflow-y-auto" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Question suggestion banner */}
            {questionSuggestion && (() => {
              const suggested = session.briefing?.preparedQuestions?.find((q) => q.id === questionSuggestion.suggestedQuestionId);
              if (!suggested) return null;
              return (
                <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(217,119,6,0.04)' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">💡</span>
                    <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>FÖRESLAGEN FRÅGA</span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed mb-1.5">{suggested.question}</p>
                  {suggested.targetSpeaker && (
                    <p className="text-xs mb-2" style={{ color: 'var(--color-accent)' }}>🎯 {suggested.targetSpeaker}</p>
                  )}
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{questionSuggestion.reasoning}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        fetch(`/api/sessions/${sessionId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ preparedQuestionUpdate: { questionId: suggested.id, status: 'asked' } }),
                        }).then((r) => r.json()).then(setSession);
                        setQuestionSuggestion(null);
                      }}
                      className="btn-primary text-xs py-1.5 px-3"
                    >
                      ✓ Ställ frågan
                    </button>
                    <button
                      onClick={() => setQuestionSuggestion(null)}
                      className="btn-ghost text-xs py-1.5 px-3"
                    >
                      Hoppa över
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* Focus selector */}
          <div className="p-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Fokus:</span>
            {QUESTION_FOCUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => changeFocus(opt.key)}
                className="px-2 py-0.5 rounded-md text-xs transition-all"
                style={{
                  background: questionFocus === opt.key ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)',
                  color: questionFocus === opt.key ? 'white' : 'var(--color-text-secondary)',
                }}
                title={opt.description}
              >
                {opt.icon}
              </button>
            ))}
            <span className="text-xs mx-1" style={{ color: 'var(--color-border)' }}>|</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Till:</span>
            {(['anyone', 'least_active', 'most_active'] as QuestionTarget[]).map((t) => (
              <button
                key={t}
                onClick={() => changeTarget(t)}
                className="px-2 py-0.5 rounded-md text-xs transition-all"
                style={{
                  background: questionTarget === t ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)',
                  color: questionTarget === t ? 'white' : 'var(--color-text-secondary)',
                }}
              >
                {t === 'anyone' ? 'Alla' : t === 'least_active' ? 'Tystast' : 'Aktivast'}
              </button>
            ))}
          </div>

          {/* Picked questions (highlighted) */}
          {pickedAiQuestions.length > 0 && (
            <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(99,102,241,0.05)' }}>
              <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-accent)' }}>Valda frågor ({pickedAiQuestions.length})</h3>
              {pickedAiQuestions.map((q) => (
                <div key={q.id} className="mb-2 p-2 rounded-lg" style={{ background: 'var(--color-accent-subtle)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <p className="text-sm font-medium leading-relaxed">{q.question}</p>
                  {q.targetSpeaker && <span className="text-xs" style={{ color: 'var(--color-accent)' }}>&#x1F3AF; {q.targetSpeaker}</span>}
                  <button onClick={() => dismissQuestion(q.id, 'ai')} className="btn-ghost text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>Ställd</button>
                </div>
              ))}
            </div>
          )}

          {/* New AI questions */}
          <div className="p-3">
            <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
              AI-frågor ({newAiQuestions.length})
            </h3>
            {newAiQuestions.length === 0 && (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                {isLive ? 'Väntar på nya AI-frågor...' : 'Starta sessionen'}
              </p>
            )}
            {newAiQuestions.slice().reverse().map((q) => (
              <div key={q.id} className="mb-3 animate-slide-up">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => highlightQuestion(q.id, 'ai')}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs transition-all hover:scale-110"
                      style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)', border: '1px solid rgba(34,197,94,0.2)' }}
                      title="Välj fråga"
                    >
                      &#x2713;
                    </button>
                    <button
                      onClick={() => dismissQuestion(q.id, 'ai')}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-xs transition-all hover:scale-110"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}
                      title="Avfärda"
                    >
                      &#x2715;
                    </button>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="badge-accent text-xs">{QUESTION_CATEGORY_LABELS[q.category]}</span>
                      {q.targetSpeaker && <span className="badge-muted text-xs">&#x1F3AF; {q.targetSpeaker}</span>}
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{q.relevanceScore}/10</span>
                    </div>
                    <p className="text-sm leading-relaxed">{q.question}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{q.context}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quotes */}
          {quotes.length > 0 && (
            <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>Citat ({quotes.length})</h3>
              {quotes.slice(-5).reverse().map((q) => (
                <div key={q.id} className="mb-2 quote-block" style={{ padding: '0.5rem 0.75rem', margin: '0.25rem 0' }}>
                  <p className="text-sm italic">&ldquo;{q.quote}&rdquo;</p>
                  <span className="text-xs" style={{ color: 'var(--color-accent)' }}>— {q.speakerName}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Audience questions + Polls + Controls */}
        <div className="overflow-y-auto">
          {/* Audio error */}
          {audioError && (
            <div className="p-3" style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid var(--color-danger)' }}>
              <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{audioError}</p>
            </div>
          )}

          {/* Recording */}
          {(recording.isRecording || recording.hasRecording) && (
            <div className="p-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <RecordingControls
                isRecording={recording.isRecording}
                hasRecording={recording.hasRecording}
                duration={recording.duration}
                blobUrl={recording.blobUrl}
                onStop={() => recording.stopRecording()}
                onDownload={() => recording.downloadRecording()}
              />
            </div>
          )}

          {/* Agenda */}
          {session.briefing?.agenda && session.briefing.agenda.length > 0 && (
            <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] tracking-widest uppercase font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  DAGORDNING
                </h3>
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {session.briefing.agenda.filter((a) => a.status === 'done').length}/{session.briefing.agenda.length}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1 rounded-full mb-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(session.briefing.agenda.filter((a) => a.status === 'done').length / session.briefing.agenda.length) * 100}%`, background: 'var(--color-success)' }} />
              </div>
              <div className="space-y-1">
                {session.briefing.agenda.sort((a, b) => a.order - b.order).map((item, idx) => {
                  const isActive = item.status === 'in_progress';
                  const isDone = item.status === 'done';
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        const nextStatus = item.status === 'upcoming' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'upcoming';
                        updateAgendaItem(item.id, nextStatus);
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all text-xs"
                      style={{
                        background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                        border: isActive ? '1px solid rgba(217,119,6,0.15)' : '1px solid transparent',
                        opacity: isDone ? 0.5 : 1,
                      }}
                    >
                      <span style={{ color: isDone ? 'var(--color-success)' : isActive ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                        {isDone ? '✓' : isActive ? '►' : '○'}
                      </span>
                      <span className="flex-1 truncate" style={{ textDecoration: isDone ? 'line-through' : 'none', color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                        {idx + 1}. {item.title}
                      </span>
                      {item.durationMinutes && (
                        <span style={{ color: 'var(--color-text-muted)' }}>{item.durationMinutes}m</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Projector control */}
          <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] tracking-widest uppercase font-medium" style={{ color: 'var(--color-text-muted)' }}>Projektorvy</h3>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {projectorSecondary ? '⊞ Delad' : 'Enkel'}
              </span>
            </div>

            {/* Single view buttons */}
            <div className="flex gap-1 flex-wrap mb-2">
              {['transcript', 'summary', 'questions', 'quotes', 'audience'].map((v) => (
                <button
                  key={v}
                  onClick={() => setProjector(v)}
                  className="px-2 py-1 rounded-md text-xs transition-all"
                  style={{
                    background: projectorView === v && !projectorSecondary ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)',
                    color: projectorView === v && !projectorSecondary ? 'white' : 'var(--color-text-secondary)',
                  }}
                >
                  {v === 'transcript' ? 'Transkript' : v === 'summary' ? 'Sammanfattning' : v === 'questions' ? 'Frågor' : v === 'quotes' ? 'Citat' : 'Publik'}
                </button>
              ))}
            </div>

            {/* Split presets */}
            <div className="flex gap-1 flex-wrap mb-1">
              {[
                { label: 'Transkript + Sammanfattning', primary: 'transcript', secondary: 'summary' },
                { label: 'Sammanfattning + Frågor', primary: 'summary', secondary: 'questions' },
                { label: 'Frågor + Publik', primary: 'questions', secondary: 'audience' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setProjector(preset.primary, preset.secondary)}
                  className="px-2 py-1 rounded-md text-xs transition-all"
                  style={{
                    background: projectorView === preset.primary && projectorSecondary === preset.secondary ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)',
                    color: projectorView === preset.primary && projectorSecondary === preset.secondary ? 'white' : 'var(--color-text-muted)',
                    border: `1px solid ${projectorView === preset.primary && projectorSecondary === preset.secondary ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)'}`,
                  }}
                >
                  ⊞ {preset.label}
                </button>
              ))}
            </div>

            {/* Advanced: custom split */}
            <button
              onClick={() => setShowAdvancedProjector(!showAdvancedProjector)}
              className="text-xs mt-1"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {showAdvancedProjector ? '▾ Dölj anpassad' : '▸ Anpassa split'}
            </button>
            {showAdvancedProjector && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-xs w-12" style={{ color: 'var(--color-text-muted)' }}>Vänster:</span>
                  {['transcript', 'summary', 'questions', 'quotes', 'audience'].map((v) => (
                    <button
                      key={v}
                      onClick={() => setProjector(v, projectorSecondary || 'summary')}
                      className="px-1.5 py-0.5 rounded text-xs transition-all"
                      style={{
                        background: projectorView === v ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)',
                        color: projectorView === v ? 'white' : 'var(--color-text-muted)',
                      }}
                    >
                      {v === 'transcript' ? '🎤' : v === 'summary' ? '📝' : v === 'questions' ? '🧠' : v === 'quotes' ? '✨' : '👥'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs w-12" style={{ color: 'var(--color-text-muted)' }}>Höger:</span>
                  {['transcript', 'summary', 'questions', 'quotes', 'audience'].map((v) => (
                    <button
                      key={v}
                      onClick={() => setProjector(projectorView, v)}
                      className="px-1.5 py-0.5 rounded text-xs transition-all"
                      style={{
                        background: projectorSecondary === v ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)',
                        color: projectorSecondary === v ? 'white' : 'var(--color-text-muted)',
                      }}
                    >
                      {v === 'transcript' ? '🎤' : v === 'summary' ? '📝' : v === 'questions' ? '🧠' : v === 'quotes' ? '✨' : '👥'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Engagement + Reactions */}
          {engagement && (
            <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Engagemang</span>
                <span className="text-sm font-bold" style={{ color: engagement.temperature > 70 ? 'var(--color-danger)' : 'var(--color-accent)' }}>{engagement.temperature}</span>
              </div>
              <div className="temperature-bar mb-2">
                <div className={`temperature-fill ${engagement.temperature > 70 ? 'temperature-fill-hot' : engagement.temperature > 40 ? 'temperature-fill-warm' : 'temperature-fill-cool'}`} style={{ width: `${engagement.temperature}%` }} />
              </div>
              {reactionBursts.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {reactionBursts.slice(-4).map((b, i) => (
                    <span key={i} className="text-xs">{REACTION_EMOJIS[b.type]}x{b.count}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Prepared questions from briefing */}
          {session.briefing?.preparedQuestions && session.briefing.preparedQuestions.length > 0 && (
            <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-warning)' }}>
                Förberedda frågor ({session.briefing.preparedQuestions.filter((q: PreparedQuestion) => q.status === 'pending').length}/{session.briefing.preparedQuestions.length})
              </h3>
              {session.briefing.preparedQuestions.map((q: PreparedQuestion) => (
                <div key={q.id} className="flex items-start gap-2 mb-2" style={{ opacity: q.status !== 'pending' ? 0.4 : 1 }}>
                  <button
                    onClick={() => {
                      const newStatus = q.status === 'pending' ? 'asked' : 'pending';
                      fetch(`/api/sessions/${sessionId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ preparedQuestionUpdate: { questionId: q.id, status: newStatus } }),
                      }).then((r) => r.json()).then(setSession);
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-xs flex-shrink-0 mt-0.5 transition-all"
                    style={{
                      background: q.status === 'asked' ? 'var(--color-success)' : q.priority === 'must_ask' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                      color: q.status === 'asked' ? 'white' : q.priority === 'must_ask' ? 'var(--color-danger)' : 'var(--color-text-muted)',
                      border: `1px solid ${q.status === 'asked' ? 'var(--color-success)' : q.priority === 'must_ask' ? 'rgba(239,68,68,0.4)' : 'var(--color-border)'}`,
                    }}
                    title={q.status === 'pending' ? 'Markera som ställd' : 'Markera som ej ställd'}
                  >
                    {q.status === 'asked' ? '\u2713' : q.priority === 'must_ask' ? '!' : '\u25CB'}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed" style={{ textDecoration: q.status === 'asked' ? 'line-through' : 'none' }}>{q.question}</p>
                    {q.targetSpeaker && <span className="text-xs" style={{ color: 'var(--color-accent)' }}>&#x1F3AF; {q.targetSpeaker}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Audience questions */}
          <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Publikfrågor ({audienceQuestions.length})
            </h3>
            {sortedAudienceQs.length === 0 && (
              <p className="text-xs text-center py-3" style={{ color: 'var(--color-text-muted)' }}>Inga frågor från publiken ännu</p>
            )}
            {sortedAudienceQs.slice(0, 15).map((q) => (
              <div key={q.id} className="flex items-start gap-2 mb-2">
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>{q.votes}</span>
                  <button
                    onClick={() => highlightQuestion(q.id, 'audience')}
                    className="w-6 h-6 rounded flex items-center justify-center text-xs"
                    style={{ background: q.status === 'highlighted' ? 'var(--color-success)' : 'rgba(255,255,255,0.04)', color: q.status === 'highlighted' ? 'white' : 'var(--color-text-muted)' }}
                  >
                    {q.status === 'highlighted' ? '\u2713' : '\u2191'}
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-relaxed">{q.text}</p>
                  {q.authorName && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>— {q.authorName}</span>}
                </div>
              </div>
            ))}

            {/* Clusters */}
            {clusters.length > 0 && (
              <div className="mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-[11px] tracking-widest uppercase font-medium" style={{ color: 'var(--color-text-muted)' }}>Teman</span>
                {clusters.map((c) => (
                  <div key={c.id} className="mt-1.5 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <span className="text-xs font-medium">{c.theme}</span>
                    <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>({c.questionIds.length})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick poll creation */}
          <div className="p-3">
            <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>Omröstning</h3>
            {!showPollForm ? (
              <button onClick={() => setShowPollForm(true)} className="btn-secondary text-xs w-full py-1.5">Skapa omröstning</button>
            ) : (
              <div className="space-y-2">
                <input className="input text-xs" placeholder="Fråga..." value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
                {pollOptions.map((o, i) => (
                  <input key={i} className="input text-xs" placeholder={`Alt ${i+1}`} value={o} onChange={(e) => { const n=[...pollOptions]; n[i]=e.target.value; setPollOptions(n); }} />
                ))}
                <div className="flex gap-2">
                  <button onClick={() => setPollOptions([...pollOptions, ''])} className="btn-ghost text-xs" style={{ color: 'var(--color-accent)' }}>+Alt</button>
                  <button onClick={createPoll} className="btn-primary text-xs flex-1">Publicera</button>
                  <button onClick={() => { setShowPollForm(false); setPollError(''); }} className="btn-ghost text-xs">Avbryt</button>
                </div>
                {pollError && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{pollError}</p>}
              </div>
            )}

            {/* Active polls */}
            {polls.filter((p) => p.status === 'active').map((poll) => (
              <div key={poll.id} className="mt-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium">{poll.question}</span>
                  <button onClick={() => socketRef.current.emit('poll:close', { sessionId, pollId: poll.id })} className="text-xs" style={{ color: 'var(--color-danger)' }}>Stäng</button>
                </div>
                {poll.options.map((opt: PollOption) => {
                  const total = poll.options.reduce((s: number, o: PollOption) => s + o.votes, 0);
                  return <div key={opt.id} className="text-xs flex justify-between"><span>{opt.text}</span><span>{total > 0 ? ((opt.votes/total)*100).toFixed(0) : 0}%</span></div>;
                })}
              </div>
            ))}
          </div>

          {/* Export */}
          <div className="p-3">
            <ExportPanel
              sessionId={sessionId}
              sessionTitle={session.title}
              transcript={transcript.filter((t) => t.isFinal).map((t) => `${t.speakerName}: ${t.text}`).join('\n')}
              summaries={summaries}
              aiQuestions={aiQuestions}
              quotes={quotes}
              audienceQuestions={audienceQuestions}
              agendaItems={session.briefing?.agenda}
              preparedQuestions={session.briefing?.preparedQuestions}
              hostName={session.hostName}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
