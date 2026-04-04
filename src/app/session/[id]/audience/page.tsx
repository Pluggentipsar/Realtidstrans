'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import {
  Session,
  TranscriptSegment,
  AISummary,
  AudienceQuestion,
  Poll,
  PollOption,
  ReactionType,
  ReactionBurst,
  EngagementSnapshot,
  REACTION_EMOJIS,
} from '@/types';
import { formatTimestamp } from '@/lib/utils';

export default function AudiencePage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [summaries, setSummaries] = useState<AISummary[]>([]);
  const [questions, setQuestions] = useState<AudienceQuestion[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [engagement, setEngagement] = useState<EngagementSnapshot | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [votedQuestionIds, setVotedQuestionIds] = useState<Set<string>>(new Set());
  const [votedPollIds, setVotedPollIds] = useState<Set<string>>(new Set());
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const [lastReaction, setLastReaction] = useState<ReactionType | null>(null);
  const [view, setView] = useState<'live' | 'questions' | 'polls'>('live');

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`).then((r) => r.json()).then(setSession).catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    const socket = socketRef.current;
    socket.emit('session:join', { sessionId, role: 'audience' });

    socket.on('transcript:final', (seg) => setTranscript((p) => [...p, seg]));
    socket.on('ai:summary', (s) => setSummaries((p) => [...p, s]));
    socket.on('audience:question_added', (q) => setQuestions((p) => [...p, q]));
    socket.on('audience:question_voted', ({ questionId, votes }) => {
      setQuestions((p) => p.map((q) => q.id === questionId ? { ...q, votes } : q));
    });
    socket.on('poll:created', (p) => { setPolls((prev) => [...prev, p]); setView('polls'); });
    socket.on('poll:updated', (p) => setPolls((prev) => prev.map((x) => x.id === p.id ? p : x)));
    socket.on('poll:closed', (p) => setPolls((prev) => prev.map((x) => x.id === p.id ? p : x)));
    socket.on('reaction:burst', (b) => setReactionBursts((p) => [...p.slice(-8), b]));
    socket.on('engagement:update', setEngagement);
    socket.on('session:status_changed', (status) => setSession((p) => p ? { ...p, status } : p));

    return () => { socket.emit('session:leave', sessionId); socket.removeAllListeners(); };
  }, [sessionId]);

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);

  const submitQuestion = () => {
    if (!newQuestion.trim()) return;
    socketRef.current.emit('audience:submit_question', { sessionId, text: newQuestion.trim(), authorName: authorName.trim() || undefined });
    setNewQuestion('');
  };

  const voteQuestion = (questionId: string) => {
    if (votedQuestionIds.has(questionId)) return;
    socketRef.current.emit('audience:vote_question', { sessionId, questionId });
    setVotedQuestionIds((p) => new Set(p).add(questionId));
  };

  const votePoll = (pollId: string, optionId: string) => {
    if (votedPollIds.has(pollId)) return;
    socketRef.current.emit('poll:vote', { sessionId, pollId, optionId });
    setVotedPollIds((p) => new Set(p).add(pollId));
  };

  const sendReaction = (type: ReactionType) => {
    if (reactionCooldown) return;
    socketRef.current.emit('audience:react', { sessionId, type });
    setReactionCooldown(true);
    setLastReaction(type);
    setTimeout(() => { setReactionCooldown(false); setLastReaction(null); }, 800);
  };

  if (!session) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div style={{ color: 'var(--color-text-muted)' }}>Ansluter...</div></div>;
  }

  const activePolls = polls.filter((p) => p.status === 'active');
  const latestSummary = summaries[summaries.length - 1];

  return (
    <div className="max-w-lg mx-auto px-4 py-3 flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
      {/* Compact header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-bold truncate">{session.title}</h1>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{session.hostName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {session.status === 'live' && <span className="badge-live text-xs">LIVE</span>}
          {session.status === 'ended' && <span className="badge-muted text-xs">Avslutad</span>}
        </div>
      </div>

      {/* Temperature bar */}
      {engagement && (
        <div className="temperature-bar mb-2 flex-shrink-0">
          <div className={`temperature-fill ${engagement.temperature > 70 ? 'temperature-fill-hot' : engagement.temperature > 40 ? 'temperature-fill-warm' : 'temperature-fill-cool'}`} style={{ width: `${engagement.temperature}%` }} />
        </div>
      )}

      {/* Reaction bar */}
      {session.status === 'live' && (
        <div className="flex justify-center gap-2 mb-2 flex-shrink-0">
          {(Object.entries(REACTION_EMOJIS) as Array<[ReactionType, string]>).map(([type, emoji]) => (
            <button
              key={type}
              onClick={() => sendReaction(type)}
              disabled={reactionCooldown}
              className="text-2xl w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-75"
              style={{
                background: lastReaction === type ? 'var(--color-accent-subtle)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${lastReaction === type ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)'}`,
                opacity: reactionCooldown && lastReaction !== type ? 0.3 : 1,
                transform: lastReaction === type ? 'scale(1.15)' : undefined,
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Floating reaction bursts */}
      {reactionBursts.length > 0 && (
        <div className="flex justify-center gap-1 mb-1 min-h-[20px] flex-shrink-0">
          {reactionBursts.slice(-3).map((b, i) => (
            <span key={i} className="reaction-float text-sm">{REACTION_EMOJIS[b.type]} x{b.count}</span>
          ))}
        </div>
      )}

      {/* Active poll banner */}
      {activePolls.length > 0 && view !== 'polls' && (
        <button onClick={() => setView('polls')} className="w-full mb-2 card-glow text-sm text-center py-2 flex-shrink-0" style={{ cursor: 'pointer' }}>
          Omröstning aktiv — tryck för att rösta
        </button>
      )}

      {/* View toggle */}
      <div className="focus-selector mb-2 flex-shrink-0">
        {[
          { key: 'live' as const, label: 'Samtal' },
          { key: 'questions' as const, label: `Frågor (${questions.length})` },
          { key: 'polls' as const, label: `Polls${activePolls.length > 0 ? ` (${activePolls.length})` : ''}` },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setView(tab.key)} className={`focus-btn ${view === tab.key ? 'focus-btn-active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — flex-1 fills remaining space */}
      <div className="card flex-1 overflow-y-auto mb-2 min-h-0">
        {view === 'live' && (
          <div className="space-y-3">
            {latestSummary && (
              <div className="animate-fade-in" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-accent)' }}>Senaste sammanfattning</div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{latestSummary.content.slice(0, 300)}{latestSummary.content.length > 300 ? '...' : ''}</p>
              </div>
            )}
            {transcript.length === 0 && <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>Väntar på att samtalet startar...</p>}
            {transcript.slice(-30).map((seg) => (
              <div key={seg.id} className="transcript-line" style={{ borderLeftColor: 'var(--color-accent)' }}>
                <span className="speaker-name text-xs" style={{ color: 'var(--color-accent)' }}>{seg.speakerName}</span>
                <p className="text-sm leading-relaxed mt-0.5">{seg.text}</p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {view === 'questions' && (
          <div className="space-y-2">
            {questions.length === 0 && <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>Inga frågor ännu</p>}
            {[...questions].sort((a, b) => b.votes - a.votes).map((q) => (
              <div key={q.id} className="flex items-start gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.75rem' }}>
                <button
                  onClick={() => voteQuestion(q.id)}
                  disabled={votedQuestionIds.has(q.id)}
                  className="min-w-[44px] py-1.5 rounded-lg text-center transition-all active:scale-90"
                  style={{
                    background: votedQuestionIds.has(q.id) ? 'var(--color-accent-subtle)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${votedQuestionIds.has(q.id) ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)'}`,
                    color: votedQuestionIds.has(q.id) ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  }}
                >
                  <div className="text-lg font-bold">{q.votes}</div>
                  <div className="text-xs">{votedQuestionIds.has(q.id) ? '\u2713' : '\u25B2'}</div>
                </button>
                <div>
                  <p className="text-sm leading-relaxed">{q.text}</p>
                  {q.authorName && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>— {q.authorName}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'polls' && (
          <div className="space-y-4">
            {polls.length === 0 && <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>Inga omröstningar</p>}
            {polls.map((poll) => {
              const total = poll.options.reduce((s: number, o: PollOption) => s + o.votes, 0);
              const hasVoted = votedPollIds.has(poll.id);
              return (
                <div key={poll.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '1rem' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-bold">{poll.question}</h4>
                    {poll.status === 'closed' && <span className="badge-muted text-xs">Stängd</span>}
                  </div>
                  {poll.options.map((opt: PollOption) => {
                    const pct = total > 0 ? (opt.votes / total) * 100 : 0;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => votePoll(poll.id, opt.id)}
                        disabled={hasVoted || poll.status === 'closed'}
                        className="w-full mb-2 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${hasVoted || poll.status === 'closed' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`,
                        }}
                      >
                        <div className="flex justify-between text-sm mb-1.5">
                          <span>{opt.text}</span>
                          <span style={{ color: 'var(--color-text-secondary)' }}>
                            {hasVoted || poll.status === 'closed' ? `${pct.toFixed(0)}%` : ''}
                          </span>
                        </div>
                        {(hasVoted || poll.status === 'closed') && (
                          <div className="temperature-bar"><div className="temperature-fill temperature-fill-cool" style={{ width: `${pct}%` }} /></div>
                        )}
                      </button>
                    );
                  })}
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{total} röster</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Question input — always at bottom */}
      {session.status === 'live' && (
        <div className="card flex-shrink-0" style={{ padding: '0.75rem', background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)' }}>
          <div className="flex gap-2 mb-1.5">
            <input
              type="text"
              className="input text-xs py-1.5"
              placeholder="Ditt namn (valfritt)"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              style={{ maxWidth: '160px' }}
            />
            <span className="text-xs self-center" style={{ color: 'var(--color-text-muted)' }}>
              {newQuestion.length}/500
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="input text-sm"
              placeholder="Ställ en fråga..."
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value.slice(0, 500))}
              onKeyDown={(e) => e.key === 'Enter' && submitQuestion()}
              maxLength={500}
            />
            <button onClick={submitQuestion} disabled={!newQuestion.trim()} className="btn-primary text-sm px-4 flex-shrink-0">
              Skicka
            </button>
          </div>
        </div>
      )}

      {/* Session ended — show summary + link to dashboard */}
      {session.status === 'ended' && (
        <div className="card flex-shrink-0 text-center" style={{ padding: '1.25rem', background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)' }}>
          <div className="text-2xl mb-3">&#x2705;</div>
          <p className="font-medium mb-1.5">Sessionen är avslutad</p>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Tack för ditt deltagande!
          </p>
          {latestSummary && (
            <div className="text-left mb-4 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-accent)' }}>Sammanfattning</div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{latestSummary.content.slice(0, 400)}{latestSummary.content.length > 400 ? '...' : ''}</p>
            </div>
          )}
          <a href={`/session/${sessionId}/dashboard`} className="btn-primary text-sm w-full inline-block">
            Se fullständigt resultat
          </a>
        </div>
      )}
    </div>
  );
}
