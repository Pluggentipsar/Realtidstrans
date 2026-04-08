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

  const [moderatorMode, setModeratorMode] = useState<'listen' | 'questions' | 'overview' | 'notes'>('listen');
  const [notes, setNotes] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(`notes_${sessionId}`) || '';
  });

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

  useEffect(() => {
    localStorage.setItem(`notes_${sessionId}`, notes);
  }, [notes, sessionId]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') setModeratorMode('listen');
      if (e.key === '2') setModeratorMode('questions');
      if (e.key === '3') setModeratorMode('overview');
      if (e.key === '4') setModeratorMode('notes');
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

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
    <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
      {/* === TOP BAR === */}
      <div className="flex items-center justify-between px-4 h-11 flex-shrink-0" style={{ background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.04)', borderTop: '2px solid var(--color-accent)' }}>
        {/* Left: title + badges */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">{session.title}</span>
          <span className="text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded" style={{ color: 'var(--color-accent)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(217,119,6,0.1)' }}>MODERATOR</span>
          {isLive && <span className="badge-live text-xs">LIVE</span>}
          <button onClick={() => navigator.clipboard.writeText(session.code)} className="font-mono text-sm font-bold px-2 py-0.5 rounded transition-all hover:opacity-70" style={{ color: 'var(--color-accent)', background: 'var(--color-accent-subtle)' }} title="Kopiera kod">{session.code}</button>
        </div>

        {/* Center: mode buttons */}
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {[
            { key: 'listen' as const, icon: '\uD83C\uDFA7', label: 'Lyssna', shortcut: '1' },
            { key: 'questions' as const, icon: '\u2753', label: 'Fr\u00e5gor', shortcut: '2' },
            { key: 'overview' as const, icon: '\uD83D\uDCCA', label: '\u00d6versikt', shortcut: '3' },
            { key: 'notes' as const, icon: '\uD83D\uDCDD', label: 'Anteckningar', shortcut: '4' },
          ].map((mode) => (
            <button
              key={mode.key}
              onClick={() => setModeratorMode(mode.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all relative"
              style={{
                background: moderatorMode === mode.key ? 'var(--color-accent)' : 'transparent',
                color: moderatorMode === mode.key ? 'white' : 'var(--color-text-muted)',
                fontWeight: moderatorMode === mode.key ? 600 : 400,
              }}
            >
              <span>{mode.icon}</span>
              <span className="hidden lg:inline">{mode.label}</span>
              <span className="text-[9px] opacity-40">{mode.shortcut}</span>
              {mode.key === 'questions' && questionSuggestion && moderatorMode !== 'questions' && (
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: 'var(--color-accent)', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
              )}
            </button>
          ))}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          {audioError && <span className="text-[11px] max-w-[200px] truncate" style={{ color: 'var(--color-danger)' }}>{audioError}</span>}
          {!isLive ? (
            <button onClick={startSession} className="btn-primary text-xs py-1.5 px-3">Starta session</button>
          ) : (
            <button onClick={stopSession} className="btn-danger text-xs py-1.5 px-3">Avsluta</button>
          )}
          <a href={`/session/${sessionId}`} target="_blank" rel="noopener noreferrer" className="text-xs py-1.5 px-3 rounded-lg font-medium transition-all" style={{ background: 'var(--color-accent)', color: 'white' }}>&#x1F4FA; Projektor</a>
          <a href={`/session/${sessionId}/dashboard`} className="btn-ghost text-xs">Dashboard</a>
        </div>
      </div>

      {/* === CONTENT AREA === */}
      <div className="flex-1 min-h-0">

        {/* LISTEN MODE */}
        {moderatorMode === 'listen' && (
          <div className="grid grid-cols-[2fr_1fr] h-full gap-0">
            {/* Left: Transcript */}
            <div className="overflow-y-auto p-4" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
              {/* Speaker analytics bar */}
              {speakerAnalytics.length > 0 && (
                <div className="flex items-center gap-3 mb-3">
                  {speakerAnalytics.map((s) => (
                    <div key={s.speakerId} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: speakerColors[s.speakerId] || 'var(--color-accent)' }} />
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{s.speakerName.split(' ')[0]} {s.speakingPercentage.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-0.5">
                {transcript.slice(-60).map((seg) => (
                  <div key={seg.id} className={`transcript-line text-sm ${!seg.isFinal ? 'opacity-40' : ''}`} style={seg.isFinal ? { borderLeftColor: speakerColors[seg.speakerId] || 'var(--color-accent)' } : {}}>
                    <span className="speaker-name text-xs" style={{ color: speakerColors[seg.speakerId] || 'var(--color-accent)' }}>{seg.speakerName}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{formatTimestamp(seg.timestamp)}</span>
                    <p className="leading-relaxed">{seg.text}</p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>

            {/* Right: Sidebar */}
            <div className="overflow-y-auto p-3 space-y-3">
              {/* Agenda compact */}
              {session.briefing?.agenda && session.briefing.agenda.length > 0 && (
                <div>
                  <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>DAGORDNING</h3>
                  <div className="space-y-0.5">
                    {session.briefing.agenda.sort((a, b) => a.order - b.order).map((item, idx) => {
                      const isActive = item.status === 'in_progress';
                      const isDone = item.status === 'done';
                      return (
                        <div key={item.id} className="rounded-lg transition-all text-xs" style={{ background: isActive ? 'var(--color-accent-subtle)' : 'transparent', border: isActive ? '1px solid rgba(217,119,6,0.15)' : '1px solid transparent', opacity: isDone ? 0.5 : 1 }}>
                          <button onClick={() => updateAgendaItem(item.id, item.status === 'upcoming' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'upcoming')} className="w-full flex items-center gap-2 p-1.5 text-left">
                            <span style={{ color: isDone ? 'var(--color-success)' : isActive ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{isDone ? '\u2713' : isActive ? '\u25BA' : '\u25CB'}</span>
                            <span className="flex-1 truncate" style={{ textDecoration: isDone ? 'line-through' : 'none', color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{idx + 1}. {item.title}</span>
                            {item.durationMinutes && <span style={{ color: 'var(--color-text-muted)' }}>{item.durationMinutes}m</span>}
                          </button>
                          {item.description && isActive && (
                            <p className="px-1.5 pb-1.5 pl-6 text-[11px] leading-relaxed animate-fade-in" style={{ color: 'var(--color-text-secondary)' }}>{item.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Question suggestion */}
              {questionSuggestion && (() => {
                const suggested = session.briefing?.preparedQuestions?.find((q) => q.id === questionSuggestion.suggestedQuestionId);
                if (!suggested) return null;
                return (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(217,119,6,0.04)', border: '1px solid rgba(217,119,6,0.1)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">{'\uD83D\uDCA1'}</span>
                      <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>NÄSTA FRÅGA</span>
                    </div>
                    <p className="text-[13px] font-medium leading-relaxed mb-1">{suggested.question}</p>
                    {suggested.targetSpeaker && <p className="text-[11px] mb-1" style={{ color: 'var(--color-accent)' }}>{'\uD83C\uDFAF'} {suggested.targetSpeaker}</p>}
                    <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-muted)' }}>{questionSuggestion.reasoning}</p>
                    <div className="flex gap-2">
                      <button onClick={() => { fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedQuestionUpdate: { questionId: suggested.id, status: 'asked' } }) }).then((r) => r.json()).then(setSession); setQuestionSuggestion(null); }} className="btn-primary text-[11px] py-1 px-2.5">{'\u2713'} Ställ</button>
                      <button onClick={() => setQuestionSuggestion(null)} className="btn-ghost text-[11px] py-1 px-2.5">Hoppa</button>
                    </div>
                  </div>
                );
              })()}

              {/* Latest summary preview */}
              {latestSummary && (
                <div>
                  <h3 className="text-[11px] tracking-widest uppercase font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>SENASTE SAMMANFATTNING</h3>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{latestSummary.content.slice(0, 200)}...</p>
                </div>
              )}

              {/* Recording */}
              {(recording.isRecording || recording.hasRecording) && (
                <RecordingControls isRecording={recording.isRecording} hasRecording={recording.hasRecording} duration={recording.duration} blobUrl={recording.blobUrl} onStop={() => recording.stopRecording()} onDownload={() => recording.downloadRecording()} />
              )}
            </div>
          </div>
        )}

        {/* QUESTIONS MODE */}
        {moderatorMode === 'questions' && (
          <div className="grid grid-cols-2 h-full gap-0">
            {/* Left: Prepared + Suggestion */}
            <div className="overflow-y-auto p-4" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
              {/* Question suggestion banner */}
              {questionSuggestion && (() => {
                const suggested = session.briefing?.preparedQuestions?.find((q) => q.id === questionSuggestion.suggestedQuestionId);
                if (!suggested) return null;
                return (
                  <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(217,119,6,0.04)', border: '1px solid rgba(217,119,6,0.1)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span>{'\uD83D\uDCA1'}</span>
                      <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>AI FÖRESLÅR</span>
                    </div>
                    <p className="text-base font-medium leading-relaxed mb-2">{suggested.question}</p>
                    {suggested.targetSpeaker && <p className="text-xs mb-1" style={{ color: 'var(--color-accent)' }}>{'\uD83C\uDFAF'} {suggested.targetSpeaker}</p>}
                    <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{questionSuggestion.reasoning}</p>
                    <div className="flex gap-2">
                      <button onClick={() => { fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedQuestionUpdate: { questionId: suggested.id, status: 'asked' } }) }).then((r) => r.json()).then(setSession); setQuestionSuggestion(null); }} className="btn-primary text-xs py-2 px-4">{'\u2713'} Ställ frågan</button>
                      <button onClick={() => setQuestionSuggestion(null)} className="btn-ghost text-xs py-2 px-4">Hoppa över</button>
                    </div>
                  </div>
                );
              })()}

              {/* Active agenda item context */}
              {(() => {
                const activeItem = session.briefing?.agenda?.find((a) => a.status === 'in_progress');
                if (!activeItem) return null;
                return (
                  <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[11px]" style={{ color: 'var(--color-accent)' }}>{'\u25BA'} {activeItem.title}</span>
                    {activeItem.description && <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{activeItem.description}</p>}
                  </div>
                );
              })()}

              {/* Prepared questions - LARGE */}
              <h3 className="text-[11px] tracking-widest uppercase font-medium mb-3" style={{ color: 'var(--color-text-muted)' }}>FÖRBEREDDA FRÅGOR</h3>
              {session.briefing?.preparedQuestions && session.briefing.preparedQuestions.length > 0 ? (
                <div className="space-y-2">
                  {session.briefing.preparedQuestions.map((q) => (
                    <div key={q.id} className="flex items-start gap-3 p-3 rounded-lg transition-all" style={{ background: q.status === 'asked' ? 'rgba(52,211,153,0.05)' : q.priority === 'must_ask' ? 'rgba(248,113,113,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${q.status === 'asked' ? 'rgba(52,211,153,0.1)' : q.priority === 'must_ask' ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)'}`, opacity: q.status === 'asked' ? 0.5 : 1 }}>
                      <button onClick={() => { const newStatus = q.status === 'pending' ? 'asked' : 'pending'; fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedQuestionUpdate: { questionId: q.id, status: newStatus } }) }).then((r) => r.json()).then(setSession); }} className="w-6 h-6 rounded flex items-center justify-center text-xs flex-shrink-0 mt-0.5 transition-all" style={{ background: q.status === 'asked' ? 'var(--color-success)' : q.priority === 'must_ask' ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.04)', color: q.status === 'asked' ? 'white' : q.priority === 'must_ask' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                        {q.status === 'asked' ? '\u2713' : q.priority === 'must_ask' ? '!' : '\u25CB'}
                      </button>
                      <div className="flex-1">
                        <p className="text-sm leading-relaxed" style={{ textDecoration: q.status === 'asked' ? 'line-through' : 'none' }}>{q.question}</p>
                        {q.targetSpeaker && <span className="text-[11px]" style={{ color: 'var(--color-accent)' }}>{'\uD83C\uDFAF'} {q.targetSpeaker}</span>}
                        {q.notes && <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{q.notes}</p>}
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: q.priority === 'must_ask' ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)', color: q.priority === 'must_ask' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                        {q.priority === 'must_ask' ? 'M\u00c5STE' : q.priority === 'nice_to_ask' ? 'BRA' : 'OM TID'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>Inga förberedda frågor</p>
              )}
            </div>

            {/* Right: AI + Audience questions */}
            <div className="overflow-y-auto p-4">
              {/* Picked questions */}
              {pickedAiQuestions.length > 0 && (
                <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
                  <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-accent-ai, #8b5cf6)' }}>VALDA ({pickedAiQuestions.length})</h3>
                  {pickedAiQuestions.map((q) => (
                    <div key={q.id} className="mb-2">
                      <p className="text-sm font-medium leading-relaxed">{q.question}</p>
                      {q.targetSpeaker && <span className="text-[11px]" style={{ color: '#8b5cf6' }}>{'\uD83C\uDFAF'} {q.targetSpeaker}</span>}
                      <button onClick={() => dismissQuestion(q.id, 'ai')} className="btn-ghost text-[11px] ml-2">Ställd</button>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Questions */}
              <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>AI-FRÅGOR ({newAiQuestions.length})</h3>
              {newAiQuestions.length === 0 && <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>{isLive ? 'Väntar på AI-frågor...' : 'Starta sessionen'}</p>}
              {newAiQuestions.slice().reverse().map((q) => (
                <div key={q.id} className="mb-3 flex items-start gap-2 animate-slide-up">
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => highlightQuestion(q.id, 'ai')} className="w-6 h-6 rounded flex items-center justify-center text-xs" style={{ background: 'var(--color-success)', color: 'white' }} title="Välj">{'\u2713'}</button>
                    <button onClick={() => dismissQuestion(q.id, 'ai')} className="w-6 h-6 rounded flex items-center justify-center text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)' }} title="Avfärda">{'\u2715'}</button>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="badge-accent text-xs">{QUESTION_CATEGORY_LABELS[q.category]}</span>
                      {q.targetSpeaker && <span className="badge-muted text-xs">{'\uD83C\uDFAF'} {q.targetSpeaker}</span>}
                    </div>
                    <p className="text-sm leading-relaxed">{q.question}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{q.context}</p>
                  </div>
                </div>
              ))}

              {/* Audience questions */}
              {audienceQuestions.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>PUBLIKFRÅGOR ({audienceQuestions.length})</h3>
                  {sortedAudienceQs.slice(0, 10).map((q) => (
                    <div key={q.id} className="flex items-start gap-2 mb-2">
                      <span className="text-sm font-bold min-w-[32px] text-center" style={{ color: 'var(--color-accent)' }}>{q.votes}</span>
                      <p className="text-xs leading-relaxed">{q.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* OVERVIEW MODE */}
        {moderatorMode === 'overview' && (
          <div className="grid grid-cols-3 h-full gap-0">
            {/* Left: Summaries + Quotes */}
            <div className="overflow-y-auto p-4" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[11px] tracking-widest uppercase font-medium mb-3" style={{ color: 'var(--color-text-muted)' }}>SAMMANFATTNINGAR ({summaries.length})</h3>
              {summaries.length === 0 && <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>Inga sammanfattningar ännu</p>}
              {summaries.map((s) => (
                <div key={s.id} className="mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '1rem' }}>
                  {s.topicLabel && <span className="badge-accent text-xs mb-1">{s.topicLabel}</span>}
                  <div className="leading-relaxed prose prose-invert prose-xs max-w-none text-sm"><ReactMarkdown>{s.content}</ReactMarkdown></div>
                </div>
              ))}
              {quotes.length > 0 && (
                <>
                  <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2 mt-4" style={{ color: 'var(--color-text-muted)' }}>CITAT ({quotes.length})</h3>
                  {quotes.sort((a, b) => b.impactScore - a.impactScore).map((q) => (
                    <div key={q.id} className="quote-block mb-2" style={{ padding: '0.5rem 0.75rem', margin: '0.25rem 0' }}>
                      <p className="text-sm italic">“{q.quote}”</p>
                      <span className="text-xs" style={{ color: 'var(--color-accent)' }}>— {q.speakerName}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Middle: Questions */}
            <div className="overflow-y-auto p-4" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>AI-FRÅGOR ({newAiQuestions.length})</h3>
              {newAiQuestions.slice().reverse().slice(0, 10).map((q) => (
                <div key={q.id} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1"><span className="badge-accent text-xs">{QUESTION_CATEGORY_LABELS[q.category]}</span></div>
                  <p className="text-sm leading-relaxed">{q.question}</p>
                </div>
              ))}
              {audienceQuestions.length > 0 && (
                <>
                  <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2 mt-4" style={{ color: 'var(--color-text-muted)' }}>PUBLIKFRÅGOR ({audienceQuestions.length})</h3>
                  {sortedAudienceQs.slice(0, 8).map((q) => (
                    <div key={q.id} className="flex items-start gap-2 mb-2">
                      <span className="text-sm font-bold min-w-[28px] text-center" style={{ color: 'var(--color-accent)' }}>{q.votes}</span>
                      <p className="text-xs">{q.text}</p>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Right: Agenda + Engagement + Projector + Polls + Export */}
            <div className="overflow-y-auto p-3 space-y-3">
              {/* Agenda */}
              {session.briefing?.agenda && session.briefing.agenda.length > 0 && (
                <div>
                  <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>DAGORDNING</h3>
                  {session.briefing.agenda.sort((a, b) => a.order - b.order).map((item, idx) => (
                    <button key={item.id} onClick={() => updateAgendaItem(item.id, item.status === 'upcoming' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'upcoming')} className="w-full flex items-center gap-1.5 p-1 text-left text-xs" style={{ opacity: item.status === 'done' ? 0.4 : 1 }}>
                      <span style={{ color: item.status === 'done' ? 'var(--color-success)' : item.status === 'in_progress' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{item.status === 'done' ? '\u2713' : item.status === 'in_progress' ? '\u25BA' : '\u25CB'}</span>
                      <span style={{ color: item.status === 'in_progress' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{idx + 1}. {item.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Engagement */}
              {engagement && (
                <div>
                  <h3 className="text-[11px] tracking-widest uppercase font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>ENGAGEMANG</h3>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Temperatur</span>
                    <span className="text-sm font-bold" style={{ color: engagement.temperature > 70 ? 'var(--color-danger)' : 'var(--color-accent)' }}>{engagement.temperature}</span>
                  </div>
                  <div className="temperature-bar"><div className={`temperature-fill ${engagement.temperature > 70 ? 'temperature-fill-hot' : engagement.temperature > 40 ? 'temperature-fill-warm' : 'temperature-fill-cool'}`} style={{ width: `${engagement.temperature}%` }} /></div>
                </div>
              )}

              {/* Projector controls */}
              <div>
                <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>PROJEKTORVY</h3>
                <div className="flex gap-1 flex-wrap mb-1">
                  {['transcript', 'summary', 'questions', 'quotes', 'audience'].map((v) => (
                    <button key={v} onClick={() => setProjector(v)} className="px-2 py-1 rounded-md text-[11px] transition-all" style={{ background: projectorView === v && !projectorSecondary ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)', color: projectorView === v && !projectorSecondary ? 'white' : 'var(--color-text-muted)' }}>
                      {v === 'transcript' ? 'Transkript' : v === 'summary' ? 'Sammanfattning' : v === 'questions' ? 'Fr\u00e5gor' : v === 'quotes' ? 'Citat' : 'Publik'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {[{ label: 'T+S', p: 'transcript', s: 'summary' }, { label: 'S+F', p: 'summary', s: 'questions' }, { label: 'F+P', p: 'questions', s: 'audience' }].map((preset) => (
                    <button key={preset.label} onClick={() => setProjector(preset.p, preset.s)} className="px-2 py-1 rounded-md text-[11px]" style={{ background: projectorView === preset.p && projectorSecondary === preset.s ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)', color: projectorView === preset.p && projectorSecondary === preset.s ? 'white' : 'var(--color-text-muted)' }}>
                      {'\u229E'} {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Polls */}
              <div>
                <h3 className="text-[11px] tracking-widest uppercase font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>OMRÖSTNING</h3>
                {!showPollForm ? (
                  <button onClick={() => setShowPollForm(true)} className="btn-secondary text-[11px] w-full py-1.5">Skapa</button>
                ) : (
                  <div className="space-y-1.5">
                    <input className="input text-xs" placeholder="Fråga..." value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
                    {pollOptions.map((o, i) => (<input key={i} className="input text-xs" placeholder={`Alt ${i+1}`} value={o} onChange={(e) => { const n=[...pollOptions]; n[i]=e.target.value; setPollOptions(n); }} />))}
                    <div className="flex gap-1">
                      <button onClick={() => setPollOptions([...pollOptions, ''])} className="btn-ghost text-[11px]">+</button>
                      <button onClick={createPoll} className="btn-primary text-[11px] flex-1">Publicera</button>
                      <button onClick={() => setShowPollForm(false)} className="btn-ghost text-[11px]">{'\u2715'}</button>
                    </div>
                    {pollError && <p className="text-[11px]" style={{ color: 'var(--color-danger)' }}>{pollError}</p>}
                  </div>
                )}
              </div>

              {/* Export */}
              <ExportPanel sessionId={sessionId} sessionTitle={session.title} transcript={transcript.filter((t) => t.isFinal).map((t) => `${t.speakerName}: ${t.text}`).join('\n')} summaries={summaries} aiQuestions={aiQuestions} quotes={quotes} audienceQuestions={audienceQuestions} agendaItems={session.briefing?.agenda} preparedQuestions={session.briefing?.preparedQuestions} hostName={session.hostName} />
            </div>
          </div>
        )}

        {/* NOTES MODE */}
        {moderatorMode === 'notes' && (
          <div className="grid grid-cols-2 h-full gap-0">
            {/* Left: Transcript */}
            <div className="overflow-y-auto p-4" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="space-y-0.5">
                {transcript.slice(-60).map((seg) => (
                  <div key={seg.id} className={`transcript-line text-sm ${!seg.isFinal ? 'opacity-40' : ''}`} style={seg.isFinal ? { borderLeftColor: speakerColors[seg.speakerId] || 'var(--color-accent)' } : {}}>
                    <span className="speaker-name text-xs" style={{ color: speakerColors[seg.speakerId] || 'var(--color-accent)' }}>{seg.speakerName}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{formatTimestamp(seg.timestamp)}</span>
                    <p className="leading-relaxed">{seg.text}</p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>

            {/* Right: Notes */}
            <div className="flex flex-col p-4">
              <h3 className="text-[11px] tracking-widest uppercase font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>ANTECKNINGAR</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Skriv anteckningar här... Sparas automatiskt."
                className="textarea flex-1 text-sm"
                style={{ minHeight: '200px', resize: 'none', background: 'rgba(255,255,255,0.02)' }}
              />
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>Sparas lokalt i webbläsaren</p>
            </div>
          </div>
        )}
      </div>

      {/* === STATUS BAR === */}
      <div className="h-7 flex items-center justify-between px-4 text-[11px] flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: 'var(--color-text-muted)' }}>
        <div className="flex items-center gap-3">
          {engagement && <span>Temp: {engagement.temperature}</span>}
          <span>{transcript.filter((t) => t.isFinal).length} segment</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{aiQuestions.length} AI-frågor</span>
          <span>{audienceQuestions.length} publikfrågor</span>
          <span>{summaries.length} sammanfattningar</span>
        </div>
      </div>
    </div>
  );
}
