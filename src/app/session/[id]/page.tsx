'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { getSocket } from '@/lib/socket';
import { AudioCapture } from '@/lib/audio-capture';
import { TextSizeProvider } from '@/components/ui/text-size-provider';
import { PresentationView } from '@/components/ui/presentation-view';
import { AudioVisualizer, AudioLevelIndicator } from '@/components/ui/audio-visualizer';
import { AIStatusBar, AINotificationStack, useAINotifications, AIProcessState } from '@/components/ui/ai-status';
import { useRecording, RecordingControls } from '@/components/ui/recording-manager';
import { useNewItems } from '@/components/ui/use-new-items';
import { QuestionFocusSelector } from '@/components/ui/question-focus-selector';
import { LiveSpeakerBar } from '@/components/ui/live-speaker-bar';
import { QRCodeSVG } from 'qrcode.react';
import type { QuestionFocus, QuestionTarget, SpeakerAnalytics, AIParticipantStatement } from '@/types';
import { AI_PARTICIPANT_PERSONAS } from '@/types';
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
  ReactionBurst,
  QUESTION_CATEGORY_LABELS,
  QUOTE_CATEGORY_LABELS,
  REACTION_EMOJIS,
} from '@/types';
import { formatTimestamp } from '@/lib/utils';

const FOCUS_MODES = [
  { key: 'transcript' as const, label: 'Transkript', icon: '\uD83C\uDFA4' },
  { key: 'summary' as const, label: 'Sammanfattning', icon: '\uD83D\uDCDD' },
  { key: 'questions' as const, label: 'AI-frågor', icon: '\uD83E\uDDE0' },
  { key: 'quotes' as const, label: 'Citat', icon: '\u2728' },
  { key: 'audience' as const, label: 'Publik', icon: '\uD83D\uDC65' },
];

export default function LiveSessionPage() {
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
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [topicShifts, setTopicShifts] = useState<Array<{ topic: string; timestamp: number }>>([]);
  const [isLive, setIsLive] = useState(false);
  const [gapAnalysis, setGapAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [aiStates, setAiStates] = useState<AIProcessState[]>(['idle']);
  const [questionFocus, setQuestionFocus] = useState<QuestionFocus>('balanced');
  const [questionCount, setQuestionCount] = useState(3);
  const [questionTarget, setQuestionTarget] = useState<QuestionTarget>('anyone');
  const [specificSpeaker, setSpecificSpeaker] = useState<string | undefined>();
  const [liveSpeakerAnalytics, setLiveSpeakerAnalytics] = useState<SpeakerAnalytics[]>([]);
  const { notifications, addNotification } = useAINotifications();

  // Recording
  const recording = useRecording({
    stream: audioStream,
    sessionId,
    sessionTitle: session?.title || 'session',
  });

  // Poll creation
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const summaryEndRef = useRef<HTMLDivElement>(null);
  const questionsEndRef = useRef<HTMLDivElement>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`).then((r) => r.json()).then((s) => { setSession(s); setIsLive(s.status === 'live'); }).catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    const socket = socketRef.current;
    socket.emit('session:join', { sessionId, role: 'host' });

    socket.on('transcript:partial', (segment) => {
      setTranscript((prev) => {
        const idx = prev.findIndex((s) => !s.isFinal && s.speakerId === segment.speakerId);
        if (idx >= 0) { const u = [...prev]; u[idx] = segment; return u; }
        return [...prev, segment];
      });
    });
    socket.on('transcript:final', (segment) => {
      setTranscript((prev) => [...prev.filter((s) => !(!s.isFinal && s.speakerId === segment.speakerId)), segment]);
    });
    socket.on('ai:summary', (s) => {
      setSummaries((p) => [...p, s]);
      newSummaries.markNew(s.id);
      setAiStates((p) => p.filter((st) => st !== 'summarizing'));
      addNotification('summary', 'Ny sammanfattning klar');
    });
    socket.on('ai:questions', (q) => {
      setAiQuestions((p) => [...p, ...q]);
      newQuestions.markManyNew(q.map((x: { id: string }) => x.id));
      setAiStates((p) => p.filter((st) => st !== 'generating_questions'));
      addNotification('questions', `${q.length} nya fördjupningsfrågor`);
    });
    socket.on('ai:quotes', (q) => {
      setQuotes((p) => [...p, ...q]);
      newQuotes.markManyNew(q.map((x: { id: string }) => x.id));
      setAiStates((p) => p.filter((st) => st !== 'extracting_quotes'));
      if (q.length > 0) addNotification('quotes', `${q.length} citat extraherade`);
    });
    socket.on('ai:topic_shift', (d) => {
      setTopicShifts((p) => [...p, d]);
      addNotification('topic_shift', `Ämnesbyte: ${d.topic}`);
    });
    socket.on('audience:question_added', (q) => setAudienceQuestions((p) => [...p, q]));
    socket.on('audience:question_voted', ({ questionId, votes }) => {
      setAudienceQuestions((p) => p.map((q) => (q.id === questionId ? { ...q, votes } : q)));
    });
    socket.on('audience:clusters_updated', setClusters);
    socket.on('poll:created', (p) => setPolls((prev) => [...prev, p]));
    socket.on('poll:updated', (p) => setPolls((prev) => prev.map((x) => x.id === p.id ? p : x)));
    socket.on('poll:closed', (p) => setPolls((prev) => prev.map((x) => x.id === p.id ? p : x)));
    socket.on('engagement:update', setEngagement);
    socket.on('speakers:analytics', setLiveSpeakerAnalytics);
    socket.on('reaction:burst', (b) => setReactionBursts((p) => [...p.slice(-20), b]));
    socket.on('session:status_changed', (status) => {
      setSession((p) => (p ? { ...p, status } : p));
      setIsLive(status === 'live');
    });

    // Listen for moderator projector commands
    socket.on('projector:set_view', ({ view, secondary }) => {
      if (view === 'qr_code') {
        setShowProjectorQR(true);
        return;
      }
      setShowProjectorQR(false);
      const modeMap: Record<string, string> = {
        transcript: 'transcript', summary: 'summary', questions: 'questions',
        quotes: 'quotes', audience: 'audience',
      };
      if (modeMap[view]) {
        setRemoteViewCommand((prev) => ({
          primary: modeMap[view],
          secondary: secondary && modeMap[secondary] ? modeMap[secondary] : null,
          v: (prev?.v || 0) + 1,
        }));
      }
    });
    // AI Participant
    socket.on('ai_participant:shown', ({ statement, displayMode }) => {
      if (displayMode === 'fullscreen') {
        setAiStatement(statement);
        setTimeout(() => setAiStatement(null), 30000);
      } else {
        // Inline: add as a special transcript segment
        setAiInlineStatements((prev) => [...prev, statement]);
      }
    });

    socket.on('session:speaker_identified', (speaker) => {
      setSession((p) => p ? { ...p, speakers: [...p.speakers.filter(s => s.id !== speaker.id), speaker] } : p);
      // Retroactively update transcript entries with new speaker name
      setTranscript((prev) => prev.map((seg) =>
        seg.speakerId === speaker.id ? { ...seg, speakerName: speaker.name } : seg
      ));
    });
    socket.on('session:error', (err) => {
      console.error('Session error:', err);
      setAudioError(err.message || 'Ett fel uppstod');
    });

    return () => { socket.emit('session:leave', sessionId); socket.removeAllListeners(); };
  }, [sessionId]);

  useEffect(() => {
    // Only scroll if the ref is visible (i.e., transcript view is shown)
    if (transcriptEndRef.current && transcriptEndRef.current.offsetParent !== null) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [transcript]);

  // Auto-scroll summaries and questions when new ones arrive
  useEffect(() => {
    if (summaryEndRef.current && summaryEndRef.current.offsetParent !== null) {
      summaryEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [summaries]);

  useEffect(() => {
    if (questionsEndRef.current && questionsEndRef.current.offsetParent !== null) {
      questionsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [aiQuestions]);

  // Offline buffering
  useEffect(() => {
    const onOffline = () => audioCaptureRef.current?.startBuffering();
    const onOnline = () => {
      audioCaptureRef.current?.stopBuffering();
      const chunks = audioCaptureRef.current?.flushBuffer() || [];
      for (const chunk of chunks) socketRef.current.emit('audio:chunk', { sessionId, chunk });
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => { window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
  }, [sessionId]);

  const [audioError, setAudioError] = useState<string | null>(null);
  const [remoteViewCommand, setRemoteViewCommand] = useState<{ primary: string; secondary: string | null; v: number } | null>(null);
  const [aiStatement, setAiStatement] = useState<AIParticipantStatement | null>(null);
  const [aiInlineStatements, setAiInlineStatements] = useState<AIParticipantStatement[]>([]);
  const [showProjectorQR, setShowProjectorQR] = useState(false);
  const newSummaries = useNewItems(10000);
  const newQuestions = useNewItems(10000);
  const newQuotes = useNewItems(10000);

  const startSession = useCallback(async () => {
    setAudioError(null);
    try {
      const ac = new AudioCapture();
      audioCaptureRef.current = ac;
      await ac.start((chunk) => socketRef.current.emit('audio:chunk', { sessionId, chunk }));
      setAudioStream(ac.getStream());
      socketRef.current.emit('transcription:start', sessionId);
      setIsLive(true);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Mikrofonbehörighet nekad. Tillåt mikrofon i webbläsaren och försök igen.'
        : 'Kunde inte starta mikrofon. Kontrollera att en mikrofon är ansluten.';
      setAudioError(msg);
      console.error('Audio capture failed:', err);
    }
  }, [sessionId]);

  const stopSession = useCallback(() => {
    recording.stopRecording();
    audioCaptureRef.current?.stop();
    setAudioStream(null);
    setAiStates(['idle']);
    audioCaptureRef.current = null;
    socketRef.current.emit('transcription:stop', sessionId);
    setIsLive(false);
  }, [sessionId]);

  const analyzeGaps = useCallback(async () => {
    setIsAnalyzing(true);
    setAiStates((p) => [...p.filter((s) => s !== 'idle'), 'analyzing_gaps']);
    try {
      const r = await fetch(`/api/sessions/${sessionId}/gap-analysis`, { method: 'POST' });
      const d = await r.json();
      setGapAnalysis(d.content);
      addNotification('gap_analysis', 'Luckanalys klar');
    } catch { /* ignore */ } finally {
      setIsAnalyzing(false);
      setAiStates((p) => p.filter((s) => s !== 'analyzing_gaps'));
    }
  }, [sessionId, addNotification]);

  const createPoll = useCallback(() => {
    const validOptions = pollOptions.filter((o) => o.trim());
    if (!pollQuestion.trim() || validOptions.length < 2) return;
    socketRef.current.emit('poll:create', { sessionId, question: pollQuestion, options: validOptions });
    setPollQuestion(''); setPollOptions(['', '']); setShowPollForm(false);
  }, [sessionId, pollQuestion, pollOptions]);

  const closePoll = useCallback((pollId: string) => {
    socketRef.current.emit('poll:close', { sessionId, pollId });
  }, [sessionId]);

  if (!session) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div style={{ color: 'var(--color-text-muted)' }}>Laddar session...</div></div>;
  }

  // Render content for each focus mode
  const renderContent = (mode: string) => {
    switch (mode) {
      case 'transcript': {
        // Show only the last N final segments for projector clarity
        const finalSegments = transcript.filter((s) => s.isFinal);
        const visibleCount = 6; // Show last 6 final lines
        const visible = finalSegments.slice(-visibleCount);
        // Current partial (live typing)
        const currentPartial = transcript.filter((s) => !s.isFinal).slice(-1)[0];

        return (
          <div className="flex flex-col justify-end min-h-[50vh]">
            {transcript.length === 0 && (
              <p className="text-center py-20" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
                {isLive ? 'Väntar på tal...' : 'Starta sessionen för att börja transkribera'}
              </p>
            )}

            <div className="space-y-3">
              {visible.map((seg, idx) => {
                const speakerColor = session.speakers.find((s) => s.id === seg.speakerId)?.color || 'var(--color-accent)';
                const isLatest = idx === visible.length - 1;
                // Older lines fade out
                const opacity = 0.3 + (idx / visible.length) * 0.7;

                return (
                  <div
                    key={seg.id}
                    className={`transcript-line ${isLatest ? 'transcript-line-new' : ''}`}
                    style={{
                      borderLeftColor: speakerColor,
                      opacity,
                      transition: 'opacity 0.5s ease',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: speakerColor }} />
                        <span className="speaker-name text-sm font-bold" style={{ color: speakerColor }}>{seg.speakerName}</span>
                      </div>
                    </div>
                    <p className="leading-relaxed text-lg">{seg.text}</p>
                  </div>
                );
              })}

              {/* Live typing indicator — partial result */}
              {currentPartial && (
                <div className="transcript-line animate-fade-in" style={{ borderLeftColor: 'var(--color-text-muted)', opacity: 0.5 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-text-muted)' }} />
                      <span className="speaker-name text-sm" style={{ color: 'var(--color-text-muted)' }}>{currentPartial.speakerName}</span>
                    </div>
                    <div className="typing-indicator"><span></span><span></span><span></span></div>
                  </div>
                  <p className="leading-relaxed text-lg" style={{ color: 'var(--color-text-secondary)' }}>{currentPartial.text}</p>
                </div>
              )}

              {/* AI inline statements */}
              {aiInlineStatements.map((stmt) => (
              <div
                key={stmt.id}
                className="transcript-line animate-slide-up"
                style={{
                  borderLeftColor: '#8b5cf6',
                  background: 'rgba(139,92,246,0.04)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  margin: '0.5rem 0',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#8b5cf6' }} />
                    <span className="speaker-name" style={{ color: '#8b5cf6' }}>
                      AI {AI_PARTICIPANT_PERSONAS[stmt.persona]?.label || 'Deltagare'}
                    </span>
                  </div>
                  <span className="text-lg">{AI_PARTICIPANT_PERSONAS[stmt.persona]?.icon}</span>
                </div>
                <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{stmt.content}</p>
              </div>
            ))}

            <div ref={transcriptEndRef} />
            </div>
          </div>
        );
      }

      case 'summary':
        return (
          <div className="space-y-6">
            {topicShifts.length > 0 && (
              <div className="badge-accent px-3 py-1.5 text-sm" style={{ boxShadow: '0 0 12px rgba(217,119,6,0.08)' }}>Senaste ämne: {topicShifts[topicShifts.length - 1].topic}</div>
            )}
            {summaries.length === 0 && <p className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>Sammanfattningar genereras automatiskt</p>}
            {summaries.map((s) => (
              <div key={s.id} className={`animate-slide-up rounded-lg ${newSummaries.isNew(s.id) ? 'new-content' : ''}`} style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '1.5rem', padding: newSummaries.isNew(s.id) ? '1rem' : undefined }}>
                <div className="flex items-center gap-2 text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{formatTimestamp(s.coveringFrom)} - {formatTimestamp(s.coveringTo)}</span>
                  {s.topicLabel && <span className="badge-accent">{s.topicLabel}</span>}
                  {newSummaries.isNew(s.id) && <span className="new-badge text-xs font-bold" style={{ color: 'var(--color-accent)' }}>NY</span>}
                </div>
                <div className="leading-relaxed prose prose-invert prose-sm max-w-none" style={{ fontFamily: 'var(--font-body)' }}><ReactMarkdown>{s.content}</ReactMarkdown></div>
              </div>
            ))}
            <div ref={summaryEndRef} />
            {gapAnalysis && (
              <div className="card-glow" style={{ borderColor: 'var(--color-warning)' }}>
                <h3 className="font-bold mb-2" style={{ color: 'var(--color-warning)' }}>Vad har vi missat?</h3>
                <div className="leading-relaxed prose prose-invert prose-sm max-w-none"><ReactMarkdown>{gapAnalysis}</ReactMarkdown></div>
              </div>
            )}
          </div>
        );

      case 'questions':
        return (
          <div className="space-y-5">
            {aiQuestions.length === 0 && <p className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>AI-frågor visas här under sessionen</p>}
            {aiQuestions.map((q) => (
              <div key={q.id} className={`animate-slide-up rounded-lg ${newQuestions.isNew(q.id) ? 'new-ai-content' : ''}`} style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '1.25rem', padding: newQuestions.isNew(q.id) ? '1rem' : undefined }}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="badge-accent">{QUESTION_CATEGORY_LABELS[q.category]}</span>
                  {newQuestions.isNew(q.id) && <span className="new-badge text-xs font-bold" style={{ color: '#a78bfa' }}>NY</span>}
                  {q.targetSpeaker && (
                    <span className="badge-muted" style={{ borderColor: 'var(--color-accent)' }}>
                      &#x1F3AF; {q.targetSpeaker}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${q.relevanceScore * 10}%`, background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))' }} />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{q.relevanceScore}</span>
                  </div>
                </div>
                <p className="font-medium text-lg leading-relaxed">{q.question}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{q.context}</p>
              </div>
            ))}
            <div ref={questionsEndRef} />
          </div>
        );

      case 'quotes':
        return (
          <div className="space-y-6">
            {quotes.length === 0 && <p className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>Starka citat extraheras automatiskt</p>}
            {quotes.sort((a, b) => b.impactScore - a.impactScore).map((q) => (
              <div key={q.id} className="quote-block quote-glow animate-slide-up">
                <blockquote className="text-2xl italic leading-relaxed">&ldquo;{q.quote}&rdquo;</blockquote>
                <div className="flex items-center gap-3 mt-3">
                  <span className="font-bold" style={{ color: 'var(--color-accent)' }}>— {q.speakerName}</span>
                  <span className="badge-muted">{QUOTE_CATEGORY_LABELS[q.category]}</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Impact {q.impactScore}/10</span>
                </div>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{q.context}</p>
              </div>
            ))}
          </div>
        );

      case 'audience':
        return (
          <div className="space-y-5">
            {/* Active polls */}
            {polls.filter((p) => p.status === 'active').map((poll) => (
              <div key={poll.id} className="card-glow mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold">{poll.question}</h4>
                  <button onClick={() => closePoll(poll.id)} className="btn-ghost text-xs text-[11px]">Stäng</button>
                </div>
                {poll.options.map((opt: PollOption) => {
                  const total = poll.options.reduce((s: number, o: PollOption) => s + o.votes, 0);
                  const pct = total > 0 ? (opt.votes / total) * 100 : 0;
                  return (
                    <div key={opt.id} className="mb-2">
                      <div className="flex justify-between text-sm mb-1">
                        <span>{opt.text}</span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{opt.votes} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="temperature-bar"><div className="temperature-fill temperature-fill-cool" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Poll creation */}
            <button onClick={() => setShowPollForm(!showPollForm)} className="btn-secondary text-sm py-2">{showPollForm ? 'Avbryt' : 'Skapa omröstning'}</button>
            {showPollForm && (
              <div className="card space-y-3">
                <input className="input" placeholder="Fråga..." value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
                {pollOptions.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input" placeholder={`Alternativ ${i+1}`} value={o} onChange={(e) => { const n=[...pollOptions]; n[i]=e.target.value; setPollOptions(n); }} />
                    {i >= 2 && <button onClick={() => setPollOptions(pollOptions.filter((_,j)=>j!==i))} className="btn-ghost text-sm" style={{color:'var(--color-danger)'}}>X</button>}
                  </div>
                ))}
                <button onClick={() => setPollOptions([...pollOptions,''])} className="btn-ghost text-sm" style={{color:'var(--color-accent)'}}>+ Alternativ</button>
                <button onClick={createPoll} className="btn-primary text-sm">Publicera</button>
              </div>
            )}

            {/* Audience questions */}
            {audienceQuestions.length === 0 && <p className="text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Dela sessionskoden <span className="font-mono font-bold" style={{color:'var(--color-accent)'}}>{session.code}</span></p>}
            {[...audienceQuestions].sort((a, b) => b.votes - a.votes).map((q) => (
              <div key={q.id} className="flex items-start gap-4" style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.75rem' }}>
                <div className="text-center min-w-[48px]">
                  <div className="text-2xl font-bold" style={{ color: 'var(--color-accent)' }}>{q.votes}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>röster</div>
                </div>
                <div>
                  <p className="leading-relaxed">{q.text}</p>
                  {q.authorName && <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>— {q.authorName}</p>}
                </div>
              </div>
            ))}

            {/* Clusters */}
            {clusters.length > 0 && (
              <div className="mt-6">
                <h3 className="font-bold mb-3">Frageteman</h3>
                {clusters.map((c) => (
                  <div key={c.id} className="card mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{c.theme}</span>
                      <span className="badge-muted text-xs">{c.questionIds.length} frågor</span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{c.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // Sidebar content
  const sidebar = (
    <>
      {/* Audio visualizer */}
      {isLive && (
        <div className="card overflow-hidden" style={{ padding: '0.75rem' }}>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <AudioLevelIndicator stream={audioStream} isActive={isLive} />
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Lyssnar</span>
            </div>
            <span className="badge-live text-xs">LIVE</span>
          </div>
          <AudioVisualizer stream={audioStream} isActive={isLive} variant="waveform" height={48} />
        </div>
      )}

      {/* AI Status */}
      {aiStates.filter((s) => s !== 'idle').length > 0 && (
        <AIStatusBar states={aiStates} compact />
      )}

      {/* Engagement */}
      {engagement && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Engagemang</span>
            <span className="text-sm font-bold" style={{ color: engagement.temperature > 70 ? 'var(--color-danger)' : engagement.temperature > 40 ? 'var(--color-warning)' : 'var(--color-accent)' }}>{engagement.temperature}</span>
          </div>
          <div className="temperature-bar">
            <div className={`temperature-fill ${engagement.temperature > 70 ? 'temperature-fill-hot' : engagement.temperature > 40 ? 'temperature-fill-warm' : 'temperature-fill-cool'}`} style={{ width: `${engagement.temperature}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>{engagement.activeUsers} aktiva</span>
            <span>{engagement.reactionRate.toFixed(0)} reakt/min</span>
          </div>
        </div>
      )}

      {/* Reaction bursts */}
      {reactionBursts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reactionBursts.slice(-6).map((b, i) => (
            <span key={i} className="badge-muted text-base reaction-float">{REACTION_EMOJIS[b.type]} x{b.count}</span>
          ))}
        </div>
      )}

      {/* Live speaker time */}
      {liveSpeakerAnalytics.length > 0 && (
        <LiveSpeakerBar
          analytics={liveSpeakerAnalytics}
          speakerColors={Object.fromEntries(session.speakers.map((s) => [s.id, s.color]))}
          questionTarget={questionTarget}
          specificSpeaker={specificSpeaker}
          onTargetChange={(target, speaker) => {
            setQuestionTarget(target);
            setSpecificSpeaker(speaker);
            socketRef.current.emit('settings:update_question_target', { sessionId, target, specificSpeaker: speaker });
          }}
        />
      )}

      {/* Question focus selector */}
      {isLive && (
        <div className="card" style={{ padding: '0.75rem' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Fragetyp</span>
          </div>
          <QuestionFocusSelector
            currentFocus={questionFocus}
            currentCount={questionCount}
            onFocusChange={(focus) => {
              setQuestionFocus(focus);
              socketRef.current.emit('settings:update_question_focus', { sessionId, focus, count: questionCount });
            }}
            onCountChange={(count) => {
              setQuestionCount(count);
              socketRef.current.emit('settings:update_question_focus', { sessionId, focus: questionFocus, count });
            }}
            compact
          />
        </div>
      )}

      {/* Audio error */}
      {audioError && (
        <div className="card" style={{ borderColor: 'var(--color-danger)', background: 'rgba(239,68,68,0.08)' }}>
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{audioError}</p>
          <button onClick={() => setAudioError(null)} className="btn-ghost text-xs mt-2">Stäng</button>
        </div>
      )}

      {/* Recording status */}
      <RecordingControls
        isRecording={recording.isRecording}
        hasRecording={recording.hasRecording}
        duration={recording.duration}
        blobUrl={recording.blobUrl}
        onStop={() => recording.stopRecording()}
        onDownload={() => recording.downloadRecording()}
      />

      {/* Controls */}
      <div className="card space-y-2">
        {!isLive ? (
          <button onClick={startSession} className="btn-primary w-full text-sm">Starta session</button>
        ) : (
          <button onClick={stopSession} className="btn-danger w-full text-sm">Avsluta session</button>
        )}
        <button onClick={analyzeGaps} disabled={isAnalyzing} className="btn-secondary w-full text-sm">
          {isAnalyzing ? 'Analyserar...' : 'Vad har vi missat?'}
        </button>
        <a href={`/session/${sessionId}/moderator`} className="btn-ghost w-full text-sm text-center block">Moderatorvy</a>
        <a href={`/session/${sessionId}/dashboard`} className="btn-ghost w-full text-sm text-center block">Dashboard</a>
      </div>

      {/* Session info */}
      <div className="card">
        <div className="space-y-1.5 text-sm">
          {[
            ['Kod', session.code],
            ['Talare', String(session.speakers.length)],
            ['Sammanfattningar', String(summaries.length)],
            ['AI-frågor', String(aiQuestions.length)],
            ['Citat', String(quotes.length)],
            ['Publikfrågor', String(audienceQuestions.length)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
              <span className={label === 'Kod' ? 'font-mono font-bold' : ''} style={label === 'Kod' ? { color: 'var(--color-accent)', textShadow: '0 0 12px rgba(217,119,6,0.3)' } : {}}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <TextSizeProvider>
      <PresentationView
        sessionId={sessionId}
        sessionTitle={session.title}
        sessionCode={session.code}
        isLive={isLive}
        focusModes={FOCUS_MODES}
        sidebarContent={sidebar}
        externalFocusMode={remoteViewCommand?.primary ?? null}
        externalSecondaryMode={remoteViewCommand?.secondary}
        externalViewVersion={remoteViewCommand?.v}
      >
        {(focusMode) => renderContent(focusMode)}
      </PresentationView>
      <AINotificationStack notifications={notifications} />

      {/* QR Code Overlay — triggered by moderator */}
      {showProjectorQR && session && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.95)' }}
          onClick={() => setShowProjectorQR(false)}
        >
          <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
            Gå med i samtalet
          </h2>
          <p className="text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
            Skanna QR-koden eller ange koden nedan
          </p>
          <div className="p-6 rounded-3xl mb-6" style={{ background: 'white' }}>
            <QRCodeSVG
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/join?code=${session.code}`}
              size={280}
              level="H"
              bgColor="white"
              fgColor="#1a1000"
            />
          </div>
          <div className="text-6xl font-mono font-bold tracking-[0.4em] mb-4" style={{ color: 'var(--color-accent)' }}>
            {session.code}
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Tryck var som helst för att stänga
          </p>
        </div>
      )}

      {/* AI Participant Statement Overlay */}
      {aiStatement && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
          onClick={() => setAiStatement(null)}
        >
          <div
            className="max-w-3xl mx-8 animate-slide-up"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(6,6,10,0.95) 50%, rgba(217,119,6,0.05) 100%)',
              border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: 'var(--radius-xl)',
              padding: '3rem',
              boxShadow: '0 0 80px rgba(139,92,246,0.15), 0 32px 64px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}
              >
                {AI_PARTICIPANT_PERSONAS[aiStatement.persona]?.icon || '\uD83E\uDD16'}
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: '#a78bfa' }}>
                  AI {AI_PARTICIPANT_PERSONAS[aiStatement.persona]?.label || 'Deltagare'}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>tar ordet</div>
              </div>
            </div>

            {/* Statement */}
            <p className="text-xl leading-relaxed" style={{ color: 'var(--color-text-primary)', lineHeight: '1.8' }}>
              {aiStatement.content}
            </p>

            {/* Dismiss hint */}
            <div className="mt-8 text-center">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Klicka for att stanga</span>
            </div>
          </div>
        </div>
      )}
    </TextSizeProvider>
  );
}
