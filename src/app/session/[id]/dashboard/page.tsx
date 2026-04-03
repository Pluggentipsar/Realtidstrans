'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Session,
  AISummary,
  AIQuestion,
  AudienceQuestion,
  QuestionCluster,
  QUESTION_CATEGORY_LABELS,
} from '@/types';
import { formatTimestamp } from '@/lib/utils';

export default function DashboardPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [summaries, setSummaries] = useState<AISummary[]>([]);
  const [aiQuestions, setAiQuestions] = useState<AIQuestion[]>([]);
  const [audienceQuestions, setAudienceQuestions] = useState<AudienceQuestion[]>([]);
  const [clusters, setClusters] = useState<QuestionCluster[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeView, setActiveView] = useState<'overview' | 'transcript' | 'audience'>('overview');

  useEffect(() => {
    Promise.all([
      fetch(`/api/sessions/${sessionId}`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/summary`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/questions`).then((r) => r.json()),
    ]).then(([sessionData, summaryData, questionData]) => {
      setSession(sessionData);
      setSummaries(summaryData);
      setAiQuestions(questionData.aiQuestions || []);
      setAudienceQuestions(questionData.audienceQuestions || []);
      setClusters(questionData.clusters || []);
    }).catch(console.error);
  }, [sessionId]);

  const generateFinalSummary = async (type: 'chronological' | 'thematic') => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const summary = await response.json();
      setSummaries((prev) => [...prev, summary]);
    } catch (error) {
      console.error('Error generating summary:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Laddar dashboard...</div>
      </div>
    );
  }

  const intervalSummaries = summaries.filter(
    (s) => s.type === 'interval' || s.type === 'topic_shift'
  );
  const finalSummaries = summaries.filter(
    (s) => s.type === 'final_chronological' || s.type === 'final_thematic'
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{session.title}</h1>
        <p className="text-gray-400">
          {session.hostName} | {session.createdAt && new Date(session.createdAt).toLocaleDateString('sv-SE')}
          {session.status === 'ended' && (
            <span className="ml-2 badge bg-gray-700 text-gray-400">Avslutad</span>
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <div className="text-3xl font-bold text-blue-400">{session.speakers.length}</div>
          <div className="text-sm text-gray-400">Talare</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-400">{intervalSummaries.length}</div>
          <div className="text-sm text-gray-400">Sammanfattningar</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-purple-400">{aiQuestions.length}</div>
          <div className="text-sm text-gray-400">AI-frågor</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-amber-400">{audienceQuestions.length}</div>
          <div className="text-sm text-gray-400">Publikfrågor</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {[
          { key: 'overview' as const, label: 'Översikt' },
          { key: 'transcript' as const, label: 'Sammanfattningar & Frågor' },
          { key: 'audience' as const, label: 'Publikfrågor' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeView === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeView === 'overview' && (
        <div className="space-y-6">
          {/* Generate final summary */}
          <div className="card">
            <h3 className="font-medium mb-4">Generera slutsammanfattning</h3>
            <div className="flex gap-3">
              <button
                onClick={() => generateFinalSummary('chronological')}
                disabled={isGenerating}
                className="btn-primary"
              >
                {isGenerating ? 'Genererar...' : 'Kronologisk sammanfattning'}
              </button>
              <button
                onClick={() => generateFinalSummary('thematic')}
                disabled={isGenerating}
                className="btn-secondary"
              >
                {isGenerating ? 'Genererar...' : 'Tematisk sammanfattning'}
              </button>
            </div>
          </div>

          {/* Final summaries */}
          {finalSummaries.map((summary) => (
            <div key={summary.id} className="card">
              <h3 className="font-medium mb-3">
                {summary.type === 'final_chronological'
                  ? 'Kronologisk sammanfattning'
                  : 'Tematisk sammanfattning'}
              </h3>
              <div className="text-sm text-gray-200 prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                {summary.content}
              </div>
            </div>
          ))}

          {/* Speakers */}
          {session.speakers.length > 0 && (
            <div className="card">
              <h3 className="font-medium mb-4">Talare</h3>
              <div className="flex flex-wrap gap-3">
                {session.speakers.map((speaker) => (
                  <div
                    key={speaker.id}
                    className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: speaker.color }}
                    />
                    <span className="text-sm">{speaker.name}</span>
                    <span className="text-xs text-gray-500">{speaker.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeView === 'transcript' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Interval summaries */}
          <div>
            <h3 className="font-medium mb-4">Löpande sammanfattningar</h3>
            <div className="space-y-4">
              {intervalSummaries.map((s) => (
                <div key={s.id} className="card">
                  <div className="text-xs text-gray-500 mb-2">
                    {formatTimestamp(s.coveringFrom)} – {formatTimestamp(s.coveringTo)}
                  </div>
                  <p className="text-sm text-gray-200">{s.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Questions */}
          <div>
            <h3 className="font-medium mb-4">AI-genererade frågor</h3>
            <div className="space-y-3">
              {aiQuestions.map((q) => (
                <div key={q.id} className="card">
                  <span className="badge bg-blue-900/50 text-blue-300 mb-2">
                    {QUESTION_CATEGORY_LABELS[q.category]}
                  </span>
                  <p className="text-sm font-medium text-gray-200">{q.question}</p>
                  <p className="text-xs text-gray-500 mt-1">{q.context}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeView === 'audience' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* All questions sorted by votes */}
          <div>
            <h3 className="font-medium mb-4">
              Alla publikfrågor ({audienceQuestions.length})
            </h3>
            <div className="space-y-3">
              {[...audienceQuestions]
                .sort((a, b) => b.votes - a.votes)
                .map((q) => (
                  <div key={q.id} className="card flex items-start gap-3">
                    <div className="text-center min-w-[40px]">
                      <div className="text-lg font-bold text-blue-400">{q.votes}</div>
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
          </div>

          {/* Clusters */}
          <div>
            <h3 className="font-medium mb-4">Frågeteman</h3>
            <div className="space-y-4">
              {clusters.length === 0 && (
                <p className="text-sm text-gray-500">
                  Frågeteman genereras automatiskt när tillräckligt många frågor skickats in.
                </p>
              )}
              {clusters.map((c) => (
                <div key={c.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">{c.theme}</h4>
                    <span className="badge bg-gray-700 text-gray-300">
                      Prioritet {c.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{c.summary}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {c.questionIds.length} frågor i denna grupp
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
