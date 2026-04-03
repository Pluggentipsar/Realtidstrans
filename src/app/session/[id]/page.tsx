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
  QUESTION_CATEGORY_LABELS,
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
  const [isLive, setIsLive] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'questions' | 'audience'>('transcript');

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const audioCaptureRef = useRef<AudioCapture | null>(null);
  const socketRef = useRef(getSocket());

  // Load session data
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then(setSession)
      .catch(console.error);
  }, [sessionId]);

  // Set up socket listeners
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

    socket.on('ai:summary', (summary) => {
      setSummaries((prev) => [...prev, summary]);
    });

    socket.on('ai:questions', (questions) => {
      setAiQuestions((prev) => [...prev, ...questions]);
    });

    socket.on('audience:question_added', (question) => {
      setAudienceQuestions((prev) => [...prev, question]);
    });

    socket.on('audience:question_voted', ({ questionId, votes }) => {
      setAudienceQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, votes } : q))
      );
    });

    socket.on('audience:clusters_updated', (newClusters) => {
      setClusters(newClusters);
    });

    socket.on('session:status_changed', (status) => {
      setSession((prev) => (prev ? { ...prev, status } : prev));
      setIsLive(status === 'live');
    });

    return () => {
      socket.emit('session:leave', sessionId);
      socket.off('transcript:partial');
      socket.off('transcript:final');
      socket.off('ai:summary');
      socket.off('ai:questions');
      socket.off('audience:question_added');
      socket.off('audience:question_voted');
      socket.off('audience:clusters_updated');
      socket.off('session:status_changed');
    };
  }, [sessionId]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const startSession = useCallback(async () => {
    const socket = socketRef.current;
    const audioCapture = new AudioCapture();
    audioCaptureRef.current = audioCapture;

    await audioCapture.start((chunk) => {
      socket.emit('audio:chunk', { sessionId, chunk });
    });

    socket.emit('transcription:start', sessionId);
    setIsLive(true);
  }, [sessionId]);

  const stopSession = useCallback(() => {
    const socket = socketRef.current;
    audioCaptureRef.current?.stop();
    audioCaptureRef.current = null;
    socket.emit('transcription:stop', sessionId);
    setIsLive(false);
  }, [sessionId]);

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{session.title}</h1>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-sm text-gray-400">Värd: {session.hostName}</span>
            <span className="text-sm text-gray-400">
              Kod: <span className="font-mono text-blue-400 font-bold">{session.code}</span>
            </span>
            {isLive && (
              <span className="badge bg-red-900/50 text-red-400 pulse-live">
                LIVE
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          {!isLive ? (
            <button onClick={startSession} className="btn-primary">
              Starta session
            </button>
          ) : (
            <button onClick={stopSession} className="bg-red-600 hover:bg-red-500 text-white font-medium px-6 py-3 rounded-lg transition-colors">
              Avsluta session
            </button>
          )}
          <a
            href={`/session/${sessionId}/dashboard`}
            className="btn-secondary"
          >
            Dashboard
          </a>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {[
          { key: 'transcript' as const, label: 'Transkribering', count: transcript.filter((t) => t.isFinal).length },
          { key: 'summary' as const, label: 'Sammanfattningar', count: summaries.length },
          { key: 'questions' as const, label: 'AI-frågor', count: aiQuestions.length },
          { key: 'audience' as const, label: 'Publikfrågor', count: audienceQuestions.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="card min-h-[60vh] max-h-[70vh] overflow-y-auto">
            {activeTab === 'transcript' && (
              <div className="space-y-1">
                {transcript.length === 0 && (
                  <p className="text-gray-500 text-center py-20">
                    {isLive
                      ? 'Väntar på tal...'
                      : 'Starta sessionen för att börja transkribera'}
                  </p>
                )}
                {transcript.map((segment) => (
                  <div
                    key={segment.id}
                    className={`transcript-line ${!segment.isFinal ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-xs font-medium"
                        style={{ color: session.speakers.find((s) => s.id === segment.speakerId)?.color || '#9CA3AF' }}
                      >
                        {segment.speakerName}
                      </span>
                      <span className="text-xs text-gray-600">
                        {formatTimestamp(segment.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200">{segment.text}</p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}

            {activeTab === 'summary' && (
              <div className="space-y-6">
                {summaries.length === 0 && (
                  <p className="text-gray-500 text-center py-20">
                    Sammanfattningar genereras automatiskt under sessionen
                  </p>
                )}
                {summaries.map((summary) => (
                  <div key={summary.id} className="border-b border-gray-800 pb-4 last:border-0">
                    <div className="text-xs text-gray-500 mb-2">
                      {formatTimestamp(summary.coveringFrom)} – {formatTimestamp(summary.coveringTo)}
                    </div>
                    <div
                      className="text-sm text-gray-200 prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: summary.content }}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'questions' && (
              <div className="space-y-4">
                {aiQuestions.length === 0 && (
                  <p className="text-gray-500 text-center py-20">
                    AI-genererade frågor visas här under sessionen
                  </p>
                )}
                {aiQuestions.map((q) => (
                  <div key={q.id} className="border-b border-gray-800 pb-4 last:border-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="badge bg-blue-900/50 text-blue-300">
                        {QUESTION_CATEGORY_LABELS[q.category]}
                      </span>
                      <span className="text-xs text-gray-500">
                        Relevans: {q.relevanceScore}/10
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-200">{q.question}</p>
                    <p className="text-xs text-gray-500 mt-1">{q.context}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'audience' && (
              <div className="space-y-4">
                {audienceQuestions.length === 0 && (
                  <p className="text-gray-500 text-center py-20">
                    Publikfrågor visas här. Dela sessionskoden {session.code} med publiken.
                  </p>
                )}
                {[...audienceQuestions]
                  .sort((a, b) => b.votes - a.votes)
                  .map((q) => (
                    <div key={q.id} className="flex items-start gap-3 border-b border-gray-800 pb-3 last:border-0">
                      <div className="text-center min-w-[40px]">
                        <div className="text-lg font-bold text-blue-400">{q.votes}</div>
                        <div className="text-xs text-gray-500">röster</div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-200">{q.text}</p>
                        {q.authorName && (
                          <p className="text-xs text-gray-500 mt-1">– {q.authorName}</p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Live audio indicator */}
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

          {/* Session info */}
          <div className="card">
            <h3 className="font-medium mb-3">Sessionsinformation</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Sessionskod</span>
                <span className="font-mono text-blue-400 font-bold">{session.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className={isLive ? 'text-red-400' : 'text-gray-300'}>
                  {isLive ? 'Live' : session.status === 'ended' ? 'Avslutad' : 'Ej startad'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Talare</span>
                <span>{session.speakers.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Publikfrågor</span>
                <span>{audienceQuestions.length}</span>
              </div>
            </div>
          </div>

          {/* Latest AI questions sidebar */}
          {aiQuestions.length > 0 && (
            <div className="card">
              <h3 className="font-medium mb-3">Senaste AI-frågor</h3>
              <div className="space-y-3">
                {aiQuestions.slice(-3).map((q) => (
                  <div key={q.id}>
                    <span className="badge bg-blue-900/50 text-blue-300 text-xs mb-1">
                      {QUESTION_CATEGORY_LABELS[q.category]}
                    </span>
                    <p className="text-sm text-gray-300">{q.question}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Question clusters */}
          {clusters.length > 0 && (
            <div className="card">
              <h3 className="font-medium mb-3">Frågeteman (publik)</h3>
              <div className="space-y-3">
                {clusters.map((c) => (
                  <div key={c.id} className="border-b border-gray-800 pb-2 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{c.theme}</span>
                      <span className="text-xs text-gray-500">
                        {c.questionIds.length} frågor
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{c.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
