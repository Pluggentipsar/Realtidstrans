'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { AudioCapture } from '@/lib/audio-capture';
import {
  Session,
  TranscriptSegment,
  AISummary,
  AIQuestion,
  AudienceQuestion,
  QuestionCluster,
  QuotableMoment,
  Poll,
  EngagementSnapshot,
  ReactionBurst,
  QUESTION_CATEGORY_LABELS,
  QUOTE_CATEGORY_LABELS,
  REACTION_EMOJIS,
  ReactionType,
} from '@/types';
import { formatTimestamp } from '@/lib/utils';

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
  const [isRecording, setIsRecording] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'questions' | 'quotes' | 'audience' | 'polls'>('transcript');
  const [gapAnalysis, setGapAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Poll creation
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then(setSession)
      .catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    const socket = socketRef.current;
    socket.emit('session:join', { sessionId, role: 'host' });

    socket.on('transcript:partial', (segment) => {
      setTranscript((prev) => {
        const existing = prev.findIndex(
          (s) => !s.isFinal && s.speakerId === segment.speakerId
        );
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = segment;
          return updated;
        }
        return [...prev, segment];
      });
    });

    socket.on('transcript:final', (segment) => {
      setTranscript((prev) => {
        const filtered = prev.filter(
          (s) => !((!s.isFinal) && s.speakerId === segment.speakerId)
        );
        return [...filtered, segment];
      });
    });

    socket.on('ai:summary', (summary) => setSummaries((prev) => [...prev, summary]));
    socket.on('ai:questions', (questions) => setAiQuestions((prev) => [...prev, ...questions]));
    socket.on('ai:quotes', (newQuotes) => setQuotes((prev) => [...prev, ...newQuotes]));
    socket.on('ai:topic_shift', (data) => setTopicShifts((prev) => [...prev, data]));

    socket.on('audience:question_added', (question) => {
      setAudienceQuestions((prev) => [...prev, question]);
    });
    socket.on('audience:question_voted', ({ questionId, votes }) => {
      setAudienceQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, votes } : q))
      );
    });
    socket.on('audience:clusters_updated', setClusters);

    socket.on('poll:created', (poll) => setPolls((prev) => [...prev, poll]));
    socket.on('poll:updated', (poll) => {
      setPolls((prev) => prev.map((p) => (p.id === poll.id ? poll : p)));
    });
    socket.on('poll:closed', (poll) => {
      setPolls((prev) => prev.map((p) => (p.id === poll.id ? poll : p)));
    });

    socket.on('engagement:update', setEngagement);
    socket.on('reaction:burst', (burst) => {
      setReactionBursts((prev) => [...prev.slice(-20), burst]);
    });

    socket.on('session:status_changed', (status) => {
      setSession((prev) => (prev ? { ...prev, status } : prev));
      setIsLive(status === 'live');
    });

    return () => {
      socket.emit('session:leave', sessionId);
      socket.removeAllListeners();
    };
  }, [sessionId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Network status detection for offline buffering
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      audioCaptureRef.current?.startBuffering();
    };
    const handleOnline = () => {
      setIsOffline(false);
      audioCaptureRef.current?.stopBuffering();
      // Flush buffered chunks
      const chunks = audioCaptureRef.current?.flushBuffer() || [];
      const socket = socketRef.current;
      for (const chunk of chunks) {
        socket.emit('audio:chunk', { sessionId, chunk });
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [sessionId]);

  const startSession = useCallback(async () => {
    const socket = socketRef.current;
    const audioCapture = new AudioCapture();
    audioCaptureRef.current = audioCapture;

    await audioCapture.start((chunk) => {
      socket.emit('audio:chunk', { sessionId, chunk });
    });

    // Start raw recording as backup
    audioCapture.startRecording();
    setIsRecording(true);

    socket.emit('transcription:start', sessionId);
    setIsLive(true);
  }, [sessionId]);

  const stopSession = useCallback(() => {
    const socket = socketRef.current;
    audioCaptureRef.current?.stop();
    setIsRecording(false);
    audioCaptureRef.current = null;
    socket.emit('transcription:stop', sessionId);
    setIsLive(false);
  }, [sessionId]);

  const downloadRecording = useCallback(() => {
    audioCaptureRef.current?.downloadRecording(`session-${sessionId}.webm`);
  }, [sessionId]);

  const analyzeGaps = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/gap-analysis`, {
        method: 'POST',
      });
      const analysis = await response.json();
      setGapAnalysis(analysis.content);
    } catch (error) {
      console.error('Gap analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [sessionId]);

  const createPoll = useCallback(() => {
    if (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) return;
    socketRef.current.emit('poll:create', {
      sessionId,
      question: pollQuestion,
      options: pollOptions.filter((o) => o.trim()),
    });
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowPollForm(false);
  }, [sessionId, pollQuestion, pollOptions]);

  const closePoll = useCallback(
    (pollId: string) => {
      socketRef.current.emit('poll:close', { sessionId, pollId });
    },
    [sessionId]
  );

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Laddar session...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">{session.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="text-sm text-gray-400">Kod: <span className="font-mono text-blue-400 font-bold text-lg">{session.code}</span></span>
            {isLive && <span className="badge bg-red-900/50 text-red-400 pulse-live">LIVE</span>}
            {isOffline && <span className="badge bg-yellow-900/50 text-yellow-400">OFFLINE - buffrar ljud</span>}
            {engagement && (
              <span className="text-sm text-gray-400">
                Temp: <span className={`font-bold ${engagement.temperature > 70 ? 'text-red-400' : engagement.temperature > 40 ? 'text-yellow-400' : 'text-blue-400'}`}>
                  {engagement.temperature}
                </span>/100
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isLive ? (
            <button onClick={startSession} className="btn-primary">Starta session</button>
          ) : (
            <>
              <button onClick={stopSession} className="bg-red-600 hover:bg-red-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
                Avsluta
              </button>
              {isRecording && (
                <button onClick={downloadRecording} className="btn-secondary text-sm py-2 px-4">
                  Ladda ner inspelning
                </button>
              )}
            </>
          )}
          <button onClick={analyzeGaps} disabled={isAnalyzing} className="btn-secondary text-sm py-2 px-4">
            {isAnalyzing ? 'Analyserar...' : 'Vad har vi missat?'}
          </button>
          <a href={`/session/${sessionId}/dashboard`} className="btn-secondary text-sm py-2 px-4">
            Dashboard
          </a>
        </div>
      </div>

      {/* Reaction bursts display */}
      {reactionBursts.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {reactionBursts.slice(-5).map((burst, i) => (
            <div key={i} className="badge bg-gray-800 text-gray-200 text-lg animate-bounce">
              {REACTION_EMOJIS[burst.type]} x{burst.count}
            </div>
          ))}
        </div>
      )}

      {/* Topic shift notifications */}
      {topicShifts.length > 0 && (
        <div className="mb-4 p-3 bg-purple-900/20 border border-purple-800/50 rounded-lg">
          <span className="text-xs text-purple-400 font-medium">Senaste amnesbyte:</span>
          <span className="text-sm text-purple-200 ml-2">{topicShifts[topicShifts.length - 1].topic}</span>
        </div>
      )}

      {/* Gap analysis result */}
      {gapAnalysis && (
        <div className="mb-4 card bg-amber-900/10 border-amber-800/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-amber-300">Vad har vi missat?</h3>
            <button onClick={() => setGapAnalysis(null)} className="text-gray-500 hover:text-gray-300 text-sm">Stang</button>
          </div>
          <div className="text-sm text-gray-200 prose prose-invert prose-sm max-w-none whitespace-pre-wrap">{gapAnalysis}</div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 mb-4 border-b border-gray-800 overflow-x-auto">
        {[
          { key: 'transcript' as const, label: 'Transkript', count: transcript.filter((t) => t.isFinal).length },
          { key: 'summary' as const, label: 'Sammanfattningar', count: summaries.length },
          { key: 'questions' as const, label: 'AI-fragor', count: aiQuestions.length },
          { key: 'quotes' as const, label: 'Citat', count: quotes.length },
          { key: 'audience' as const, label: 'Publikfragor', count: audienceQuestions.length },
          { key: 'polls' as const, label: 'Omrostningar', count: polls.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded-full text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card min-h-[60vh] max-h-[70vh] overflow-y-auto">
            {/* Transcript tab */}
            {activeTab === 'transcript' && (
              <div className="space-y-1">
                {transcript.length === 0 && (
                  <p className="text-gray-500 text-center py-20">
                    {isLive ? 'Vantar pa tal...' : 'Starta sessionen for att borja transkribera'}
                  </p>
                )}
                {transcript.map((segment) => (
                  <div key={segment.id} className={`transcript-line ${!segment.isFinal ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium" style={{ color: session.speakers.find((s) => s.id === segment.speakerId)?.color || '#9CA3AF' }}>
                        {segment.speakerName}
                      </span>
                      <span className="text-xs text-gray-600">{formatTimestamp(segment.timestamp)}</span>
                    </div>
                    <p className="text-sm text-gray-200">{segment.text}</p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}

            {/* Summary tab */}
            {activeTab === 'summary' && (
              <div className="space-y-6">
                {summaries.length === 0 && (
                  <p className="text-gray-500 text-center py-20">Sammanfattningar genereras automatiskt</p>
                )}
                {summaries.map((summary) => (
                  <div key={summary.id} className="border-b border-gray-800 pb-4 last:border-0">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <span>{formatTimestamp(summary.coveringFrom)} - {formatTimestamp(summary.coveringTo)}</span>
                      {summary.topicLabel && (
                        <span className="badge bg-purple-900/50 text-purple-300">{summary.topicLabel}</span>
                      )}
                      <span className="badge bg-gray-800 text-gray-400">{summary.type}</span>
                    </div>
                    <div className="text-sm text-gray-200 whitespace-pre-wrap">{summary.content}</div>
                  </div>
                ))}
              </div>
            )}

            {/* AI Questions tab */}
            {activeTab === 'questions' && (
              <div className="space-y-4">
                {aiQuestions.length === 0 && (
                  <p className="text-gray-500 text-center py-20">AI-genererade fragor visas har</p>
                )}
                {aiQuestions.map((q) => (
                  <div key={q.id} className="border-b border-gray-800 pb-4 last:border-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="badge bg-blue-900/50 text-blue-300">{QUESTION_CATEGORY_LABELS[q.category]}</span>
                      <span className="text-xs text-gray-500">Relevans: {q.relevanceScore}/10</span>
                    </div>
                    <p className="text-sm font-medium text-gray-200">{q.question}</p>
                    <p className="text-xs text-gray-500 mt-1">{q.context}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Quotes tab */}
            {activeTab === 'quotes' && (
              <div className="space-y-4">
                {quotes.length === 0 && (
                  <p className="text-gray-500 text-center py-20">Starka citat extraheras automatiskt</p>
                )}
                {quotes.sort((a, b) => b.impactScore - a.impactScore).map((q) => (
                  <div key={q.id} className="border-l-4 border-blue-500 pl-4 py-2">
                    <blockquote className="text-sm text-gray-200 italic">&ldquo;{q.quote}&rdquo;</blockquote>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-medium text-blue-400">- {q.speakerName}</span>
                      <span className="badge bg-gray-800 text-gray-400">{QUOTE_CATEGORY_LABELS[q.category]}</span>
                      <span className="text-xs text-gray-500">Impact: {q.impactScore}/10</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{q.context}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Audience questions tab */}
            {activeTab === 'audience' && (
              <div className="space-y-4">
                {audienceQuestions.length === 0 && (
                  <p className="text-gray-500 text-center py-20">Dela sessionskoden {session.code} med publiken</p>
                )}
                {[...audienceQuestions].sort((a, b) => b.votes - a.votes).map((q) => (
                  <div key={q.id} className="flex items-start gap-3 border-b border-gray-800 pb-3 last:border-0">
                    <div className="text-center min-w-[40px]">
                      <div className="text-lg font-bold text-blue-400">{q.votes}</div>
                      <div className="text-xs text-gray-500">roster</div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-200">{q.text}</p>
                      {q.authorName && <p className="text-xs text-gray-500 mt-1">- {q.authorName}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Polls tab */}
            {activeTab === 'polls' && (
              <div className="space-y-6">
                <button onClick={() => setShowPollForm(!showPollForm)} className="btn-primary text-sm py-2">
                  {showPollForm ? 'Avbryt' : 'Skapa omrostning'}
                </button>

                {showPollForm && (
                  <div className="card bg-gray-800/50 space-y-3">
                    <input
                      type="text"
                      className="input text-sm py-2"
                      placeholder="Fraga..."
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                    />
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          className="input text-sm py-2"
                          placeholder={`Alternativ ${i + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...pollOptions];
                            newOpts[i] = e.target.value;
                            setPollOptions(newOpts);
                          }}
                        />
                        {i >= 2 && (
                          <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="text-red-400 text-sm px-2">
                            Ta bort
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button onClick={() => setPollOptions([...pollOptions, ''])} className="text-sm text-blue-400 hover:text-blue-300">
                        + Lagg till alternativ
                      </button>
                    </div>
                    <button onClick={createPoll} className="btn-primary text-sm py-2">Publicera</button>
                  </div>
                )}

                {polls.map((poll) => (
                  <div key={poll.id} className="card">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">{poll.question}</h4>
                      {poll.status === 'active' && (
                        <button onClick={() => closePoll(poll.id)} className="text-xs text-red-400 hover:text-red-300">Stang</button>
                      )}
                      {poll.status === 'closed' && (
                        <span className="badge bg-gray-700 text-gray-400">Stangd</span>
                      )}
                    </div>
                    {poll.options.map((opt) => {
                      const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
                      const percentage = totalVotes > 0 ? (opt.votes / totalVotes) * 100 : 0;
                      return (
                        <div key={opt.id} className="mb-2">
                          <div className="flex justify-between text-sm mb-1">
                            <span>{opt.text}</span>
                            <span className="text-gray-400">{opt.votes} ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Live indicator */}
          {isLive && (
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="audio-wave">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <span className="text-sm text-gray-300">Lyssnar...</span>
              </div>
            </div>
          )}

          {/* Temperature gauge */}
          {engagement && (
            <div className="card">
              <h3 className="text-sm font-medium mb-3">Engagemang</h3>
              <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    engagement.temperature > 70 ? 'bg-red-500' : engagement.temperature > 40 ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${engagement.temperature}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Lugnt</span>
                <span className="font-bold text-gray-300">{engagement.temperature}/100</span>
                <span>Intensivt</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">Aktiva:</span> <span className="text-gray-300">{engagement.activeUsers}</span></div>
                <div><span className="text-gray-500">Reaktioner/min:</span> <span className="text-gray-300">{engagement.reactionRate.toFixed(0)}</span></div>
              </div>
            </div>
          )}

          {/* Session info */}
          <div className="card">
            <h3 className="text-sm font-medium mb-3">Session</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Kod</span>
                <span className="font-mono text-blue-400 font-bold">{session.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Talare</span>
                <span>{session.speakers.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Publikfragor</span>
                <span>{audienceQuestions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Sammanfattn.</span>
                <span>{summaries.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Citat</span>
                <span>{quotes.length}</span>
              </div>
            </div>
          </div>

          {/* Latest quotes */}
          {quotes.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-medium mb-3">Senaste citat</h3>
              {quotes.slice(-2).map((q) => (
                <div key={q.id} className="border-l-2 border-blue-500 pl-3 mb-3 last:mb-0">
                  <p className="text-xs italic text-gray-300">&ldquo;{q.quote}&rdquo;</p>
                  <p className="text-xs text-blue-400 mt-1">- {q.speakerName}</p>
                </div>
              ))}
            </div>
          )}

          {/* Question clusters */}
          {clusters.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-medium mb-3">Frageteman</h3>
              {clusters.map((c) => (
                <div key={c.id} className="border-b border-gray-800 pb-2 mb-2 last:border-0 last:mb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{c.theme}</span>
                    <span className="text-xs text-gray-500">{c.questionIds.length} fragor</span>
                  </div>
                  <p className="text-xs text-gray-400">{c.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
