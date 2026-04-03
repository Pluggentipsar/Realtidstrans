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
  const [view, setView] = useState<'transcript' | 'summary' | 'questions' | 'polls'>('transcript');

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then(setSession)
      .catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    const socket = socketRef.current;
    socket.emit('session:join', { sessionId, role: 'audience' });

    socket.on('transcript:final', (segment) => setTranscript((prev) => [...prev, segment]));
    socket.on('ai:summary', (summary) => setSummaries((prev) => [...prev, summary]));
    socket.on('audience:question_added', (question) => setQuestions((prev) => [...prev, question]));
    socket.on('audience:question_voted', ({ questionId, votes }) => {
      setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, votes } : q)));
    });

    socket.on('poll:created', (poll) => setPolls((prev) => [...prev, poll]));
    socket.on('poll:updated', (poll) => setPolls((prev) => prev.map((p) => (p.id === poll.id ? poll : p))));
    socket.on('poll:closed', (poll) => setPolls((prev) => prev.map((p) => (p.id === poll.id ? poll : p))));

    socket.on('reaction:burst', (burst) => setReactionBursts((prev) => [...prev.slice(-10), burst]));
    socket.on('engagement:update', setEngagement);
    socket.on('session:status_changed', (status) => {
      setSession((prev) => (prev ? { ...prev, status } : prev));
    });

    return () => {
      socket.emit('session:leave', sessionId);
      socket.removeAllListeners();
    };
  }, [sessionId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const submitQuestion = () => {
    if (!newQuestion.trim()) return;
    socketRef.current.emit('audience:submit_question', {
      sessionId,
      text: newQuestion.trim(),
      authorName: authorName.trim() || undefined,
    });
    setNewQuestion('');
  };

  const voteQuestion = (questionId: string) => {
    if (votedQuestionIds.has(questionId)) return;
    socketRef.current.emit('audience:vote_question', { sessionId, questionId });
    setVotedQuestionIds((prev) => new Set(prev).add(questionId));
  };

  const votePoll = (pollId: string, optionId: string) => {
    if (votedPollIds.has(pollId)) return;
    socketRef.current.emit('poll:vote', { sessionId, pollId, optionId });
    setVotedPollIds((prev) => new Set(prev).add(pollId));
  };

  const sendReaction = (type: ReactionType) => {
    if (reactionCooldown) return;
    socketRef.current.emit('audience:react', { sessionId, type });
    setReactionCooldown(true);
    setTimeout(() => setReactionCooldown(false), 1000); // 1s cooldown
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Ansluter till session...</div>
      </div>
    );
  }

  const activePolls = polls.filter((p) => p.status === 'active');

  return (
    <div className="max-w-lg mx-auto px-4 py-4">
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-lg font-bold">{session.title}</h1>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="text-sm text-gray-400">{session.hostName}</span>
          {session.status === 'live' && <span className="badge bg-red-900/50 text-red-400 pulse-live text-xs">LIVE</span>}
          {session.status === 'ended' && <span className="badge bg-gray-700 text-gray-400 text-xs">Avslutad</span>}
        </div>
      </div>

      {/* Reaction bar */}
      {session.status === 'live' && (
        <div className="flex justify-center gap-3 mb-4">
          {(Object.entries(REACTION_EMOJIS) as Array<[ReactionType, string]>).map(([type, emoji]) => (
            <button
              key={type}
              onClick={() => sendReaction(type)}
              disabled={reactionCooldown}
              className={`text-2xl p-2 rounded-full transition-all ${
                reactionCooldown ? 'opacity-30' : 'hover:bg-gray-800 hover:scale-125 active:scale-90'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Reaction bursts */}
      {reactionBursts.length > 0 && (
        <div className="flex justify-center gap-1 mb-3">
          {reactionBursts.slice(-3).map((burst, i) => (
            <span key={i} className="text-sm animate-bounce">{REACTION_EMOJIS[burst.type]} x{burst.count}</span>
          ))}
        </div>
      )}

      {/* Active poll banner */}
      {activePolls.length > 0 && view !== 'polls' && (
        <button
          onClick={() => setView('polls')}
          className="w-full mb-3 p-3 bg-blue-900/30 border border-blue-800/50 rounded-lg text-sm text-blue-300 text-center"
        >
          {activePolls.length} aktiv omrostning - tryck for att rosta
        </button>
      )}

      {/* Temperature bar */}
      {engagement && (
        <div className="mb-4">
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                engagement.temperature > 70 ? 'bg-red-500' : engagement.temperature > 40 ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${engagement.temperature}%` }}
            />
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1 mb-3 bg-gray-900 rounded-lg p-1">
        {[
          { key: 'transcript' as const, label: 'Samtal' },
          { key: 'summary' as const, label: 'Sammanfattning' },
          { key: 'questions' as const, label: 'Fragor' },
          { key: 'polls' as const, label: `Omrostning${activePolls.length > 0 ? ` (${activePolls.length})` : ''}` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex-1 py-2 text-xs rounded-md transition-colors ${
              view === tab.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card min-h-[35vh] max-h-[45vh] overflow-y-auto mb-4">
        {view === 'transcript' && (
          <div className="space-y-2">
            {transcript.length === 0 && <p className="text-gray-500 text-center py-10 text-sm">Vantar pa att samtalet ska borja...</p>}
            {transcript.map((segment) => (
              <div key={segment.id} className="transcript-line">
                <span className="text-xs font-medium text-blue-400">{segment.speakerName}</span>
                <span className="text-xs text-gray-600 ml-2">{formatTimestamp(segment.timestamp)}</span>
                <p className="text-sm text-gray-200 mt-0.5">{segment.text}</p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {view === 'summary' && (
          <div className="space-y-4">
            {summaries.length === 0 && <p className="text-gray-500 text-center py-10 text-sm">Sammanfattningar visas har</p>}
            {summaries.map((s) => (
              <div key={s.id} className="border-b border-gray-800 pb-3 last:border-0">
                <div className="text-xs text-gray-500 mb-1">
                  {formatTimestamp(s.coveringFrom)} - {formatTimestamp(s.coveringTo)}
                  {s.topicLabel && <span className="ml-2 text-purple-400">{s.topicLabel}</span>}
                </div>
                <p className="text-sm text-gray-200">{s.content}</p>
              </div>
            ))}
          </div>
        )}

        {view === 'questions' && (
          <div className="space-y-3">
            {questions.length === 0 && <p className="text-gray-500 text-center py-10 text-sm">Inga fragor annu. Stall den forsta!</p>}
            {[...questions].sort((a, b) => b.votes - a.votes).map((q) => (
              <div key={q.id} className="flex items-start gap-3 border-b border-gray-800 pb-3 last:border-0">
                <button
                  onClick={() => voteQuestion(q.id)}
                  disabled={votedQuestionIds.has(q.id)}
                  className={`min-w-[44px] text-center py-1 rounded transition-colors ${
                    votedQuestionIds.has(q.id)
                      ? 'bg-blue-900/30 text-blue-400'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 active:bg-blue-900/30'
                  }`}
                >
                  <div className="text-lg font-bold">{q.votes}</div>
                  <div className="text-xs">{votedQuestionIds.has(q.id) ? '\u2713' : '\u25B2'}</div>
                </button>
                <div>
                  <p className="text-sm text-gray-200">{q.text}</p>
                  {q.authorName && <p className="text-xs text-gray-500 mt-1">- {q.authorName}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'polls' && (
          <div className="space-y-4">
            {polls.length === 0 && <p className="text-gray-500 text-center py-10 text-sm">Inga omrostningar annu</p>}
            {polls.map((poll) => {
              const totalVotes = poll.options.reduce((sum: number, o: PollOption) => sum + o.votes, 0);
              const hasVoted = votedPollIds.has(poll.id);
              return (
                <div key={poll.id} className="border-b border-gray-800 pb-4 last:border-0">
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-medium">{poll.question}</h4>
                    {poll.status === 'closed' && <span className="badge bg-gray-700 text-gray-400 text-xs">Stangd</span>}
                  </div>
                  {poll.options.map((opt: PollOption) => {
                    const percentage = totalVotes > 0 ? (opt.votes / totalVotes) * 100 : 0;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => votePoll(poll.id, opt.id)}
                        disabled={hasVoted || poll.status === 'closed'}
                        className={`w-full mb-2 p-2 rounded-lg text-left transition-all ${
                          hasVoted || poll.status === 'closed'
                            ? 'bg-gray-800/50 cursor-default'
                            : 'bg-gray-800 hover:bg-gray-700 active:bg-blue-900/30'
                        }`}
                      >
                        <div className="flex justify-between text-sm mb-1">
                          <span>{opt.text}</span>
                          {(hasVoted || poll.status === 'closed') && (
                            <span className="text-gray-400">{percentage.toFixed(0)}%</span>
                          )}
                        </div>
                        {(hasVoted || poll.status === 'closed') && (
                          <div className="w-full bg-gray-900 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                  <p className="text-xs text-gray-500">{totalVotes} roster</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Question input */}
      {session.status === 'live' && (
        <div className="card">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              className="input text-sm py-2"
              placeholder="Ditt namn (valfritt)"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              style={{ maxWidth: '180px' }}
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="input text-sm py-2"
              placeholder="Stall en fraga..."
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitQuestion()}
            />
            <button onClick={submitQuestion} disabled={!newQuestion.trim()} className="btn-primary py-2 px-4 text-sm">
              Skicka
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
