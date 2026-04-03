'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import {
  Session,
  TranscriptSegment,
  AISummary,
  AudienceQuestion,
} from '@/types';
import { formatTimestamp } from '@/lib/utils';

export default function AudiencePage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [summaries, setSummaries] = useState<AISummary[]>([]);
  const [questions, setQuestions] = useState<AudienceQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'transcript' | 'summary' | 'questions'>('transcript');

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

    socket.on('transcript:final', (segment) => {
      setTranscript((prev) => [...prev, segment]);
    });

    socket.on('ai:summary', (summary) => {
      setSummaries((prev) => [...prev, summary]);
    });

    socket.on('audience:question_added', (question) => {
      setQuestions((prev) => [...prev, question]);
    });

    socket.on('audience:question_voted', ({ questionId, votes }) => {
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, votes } : q))
      );
    });

    socket.on('session:status_changed', (status) => {
      setSession((prev) => (prev ? { ...prev, status } : prev));
    });

    return () => {
      socket.emit('session:leave', sessionId);
      socket.off('transcript:final');
      socket.off('ai:summary');
      socket.off('audience:question_added');
      socket.off('audience:question_voted');
      socket.off('session:status_changed');
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
    if (votedIds.has(questionId)) return;
    socketRef.current.emit('audience:vote_question', { sessionId, questionId });
    setVotedIds((prev) => new Set(prev).add(questionId));
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Ansluter till session...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold">{session.title}</h1>
        <p className="text-sm text-gray-400 mt-1">
          Värd: {session.hostName}
          {session.status === 'live' && (
            <span className="ml-2 badge bg-red-900/50 text-red-400 pulse-live">LIVE</span>
          )}
          {session.status === 'ended' && (
            <span className="ml-2 badge bg-gray-700 text-gray-400">Avslutad</span>
          )}
        </p>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-4 bg-gray-900 rounded-lg p-1">
        {[
          { key: 'transcript' as const, label: 'Samtal' },
          { key: 'summary' as const, label: 'Sammanfattning' },
          { key: 'questions' as const, label: 'Frågor' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex-1 py-2 text-sm rounded-md transition-colors ${
              view === tab.key
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card min-h-[40vh] max-h-[50vh] overflow-y-auto mb-6">
        {view === 'transcript' && (
          <div className="space-y-2">
            {transcript.length === 0 && (
              <p className="text-gray-500 text-center py-10">
                Väntar på att samtalet ska börja...
              </p>
            )}
            {transcript.map((segment) => (
              <div key={segment.id} className="transcript-line">
                <span className="text-xs font-medium text-blue-400">
                  {segment.speakerName}
                </span>
                <span className="text-xs text-gray-600 ml-2">
                  {formatTimestamp(segment.timestamp)}
                </span>
                <p className="text-sm text-gray-200 mt-0.5">{segment.text}</p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {view === 'summary' && (
          <div className="space-y-4">
            {summaries.length === 0 && (
              <p className="text-gray-500 text-center py-10">
                Sammanfattningar visas här under sessionen
              </p>
            )}
            {summaries.map((s) => (
              <div key={s.id} className="border-b border-gray-800 pb-3 last:border-0">
                <div className="text-xs text-gray-500 mb-1">
                  {formatTimestamp(s.coveringFrom)} – {formatTimestamp(s.coveringTo)}
                </div>
                <p className="text-sm text-gray-200">{s.content}</p>
              </div>
            ))}
          </div>
        )}

        {view === 'questions' && (
          <div className="space-y-3">
            {questions.length === 0 && (
              <p className="text-gray-500 text-center py-10">
                Inga frågor ännu. Ställ den första!
              </p>
            )}
            {[...questions]
              .sort((a, b) => b.votes - a.votes)
              .map((q) => (
                <div
                  key={q.id}
                  className="flex items-start gap-3 border-b border-gray-800 pb-3 last:border-0"
                >
                  <button
                    onClick={() => voteQuestion(q.id)}
                    disabled={votedIds.has(q.id)}
                    className={`min-w-[48px] text-center py-1 rounded transition-colors ${
                      votedIds.has(q.id)
                        ? 'bg-blue-900/30 text-blue-400'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <div className="text-lg font-bold">{q.votes}</div>
                    <div className="text-xs">
                      {votedIds.has(q.id) ? '✓' : '▲'}
                    </div>
                  </button>
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
              style={{ maxWidth: '200px' }}
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="input text-sm py-2"
              placeholder="Ställ en fråga..."
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitQuestion()}
            />
            <button
              onClick={submitQuestion}
              disabled={!newQuestion.trim()}
              className="btn-primary py-2 px-4 text-sm"
            >
              Skicka
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
