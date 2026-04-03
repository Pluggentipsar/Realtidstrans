'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Session,
  AISummary,
  AIQuestion,
  AudienceQuestion,
  QuestionCluster,
  QuotableMoment,
  SessionEngagement,
  SpeakerAnalytics,
  QUESTION_CATEGORY_LABELS,
  QUOTE_CATEGORY_LABELS,
  REACTION_EMOJIS,
  ReactionType,
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
  const [quotes, setQuotes] = useState<QuotableMoment[]>([]);
  const [engagement, setEngagement] = useState<SessionEngagement | null>(null);
  const [speakerAnalytics, setSpeakerAnalytics] = useState<SpeakerAnalytics[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [gapAnalysis, setGapAnalysis] = useState<AISummary | null>(null);
  const [activeView, setActiveView] = useState<'overview' | 'content' | 'audience' | 'engagement'>('overview');

  useEffect(() => {
    Promise.all([
      fetch(`/api/sessions/${sessionId}`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/summary`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/questions`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/quotes`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/engagement`).then((r) => r.json()),
    ]).then(([sessionData, summaryData, questionData, quotesData, engagementData]) => {
      setSession(sessionData);
      setSummaries(summaryData);
      setAiQuestions(questionData.aiQuestions || []);
      setAudienceQuestions(questionData.audienceQuestions || []);
      setClusters(questionData.clusters || []);
      setQuotes(quotesData || []);
      setEngagement(engagementData.engagement || null);
      setSpeakerAnalytics(engagementData.speakerAnalytics || []);
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

  const analyzeGaps = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/gap-analysis`, {
        method: 'POST',
      });
      const analysis = await response.json();
      setGapAnalysis(analysis);
    } catch (error) {
      console.error('Gap analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Laddar dashboard...</div>
      </div>
    );
  }

  const intervalSummaries = summaries.filter((s) => s.type === 'interval' || s.type === 'topic_shift');
  const finalSummaries = summaries.filter((s) => s.type === 'final_chronological' || s.type === 'final_thematic');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{session.title}</h1>
        <p className="text-gray-400">
          {session.hostName} | {session.createdAt && new Date(session.createdAt).toLocaleDateString('sv-SE')}
          {session.status === 'ended' && <span className="ml-2 badge bg-gray-700 text-gray-400">Avslutad</span>}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-8">
        {[
          { value: session.speakers.length, label: 'Talare', color: 'text-blue-400' },
          { value: intervalSummaries.length, label: 'Sammanfattningar', color: 'text-green-400' },
          { value: aiQuestions.length, label: 'AI-fragor', color: 'text-purple-400' },
          { value: quotes.length, label: 'Citat', color: 'text-pink-400' },
          { value: audienceQuestions.length, label: 'Publikfragor', color: 'text-amber-400' },
          { value: engagement?.averageTemperature.toFixed(0) || '0', label: 'Snitttemp', color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="card text-center py-4">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-gray-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800 overflow-x-auto">
        {[
          { key: 'overview' as const, label: 'Oversikt' },
          { key: 'content' as const, label: 'Innehall & Citat' },
          { key: 'audience' as const, label: 'Publiken' },
          { key: 'engagement' as const, label: 'Engagemang & Talare' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeView === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeView === 'overview' && (
        <div className="space-y-6">
          {/* Actions */}
          <div className="card">
            <h3 className="font-medium mb-4">Generera analys</h3>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => generateFinalSummary('chronological')} disabled={isGenerating} className="btn-primary text-sm py-2">
                {isGenerating ? 'Genererar...' : 'Kronologisk sammanfattning'}
              </button>
              <button onClick={() => generateFinalSummary('thematic')} disabled={isGenerating} className="btn-secondary text-sm py-2">
                {isGenerating ? 'Genererar...' : 'Tematisk sammanfattning'}
              </button>
              <button onClick={analyzeGaps} disabled={isAnalyzing} className="bg-amber-700 hover:bg-amber-600 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm disabled:opacity-50">
                {isAnalyzing ? 'Analyserar...' : 'Vad har vi missat?'}
              </button>
            </div>
          </div>

          {/* Final summaries */}
          {finalSummaries.map((summary) => (
            <div key={summary.id} className="card">
              <h3 className="font-medium mb-3">
                {summary.type === 'final_chronological' ? 'Kronologisk sammanfattning' : 'Tematisk sammanfattning'}
              </h3>
              <div className="text-sm text-gray-200 prose prose-invert prose-sm max-w-none whitespace-pre-wrap">{summary.content}</div>
            </div>
          ))}

          {/* Gap analysis */}
          {gapAnalysis && (
            <div className="card bg-amber-900/10 border-amber-800/50">
              <h3 className="font-medium mb-3 text-amber-300">Vad har vi missat?</h3>
              <div className="text-sm text-gray-200 prose prose-invert prose-sm max-w-none whitespace-pre-wrap">{gapAnalysis.content}</div>
            </div>
          )}

          {/* Speakers */}
          {session.speakers.length > 0 && (
            <div className="card">
              <h3 className="font-medium mb-4">Talare</h3>
              <div className="flex flex-wrap gap-3">
                {session.speakers.map((speaker) => (
                  <div key={speaker.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: speaker.color }} />
                    <span className="text-sm">{speaker.name}</span>
                    <span className="text-xs text-gray-500">{speaker.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content & Quotes */}
      {activeView === 'content' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium mb-4">Lopande sammanfattningar</h3>
            <div className="space-y-4">
              {intervalSummaries.map((s) => (
                <div key={s.id} className="card">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                    <span>{formatTimestamp(s.coveringFrom)} - {formatTimestamp(s.coveringTo)}</span>
                    {s.topicLabel && <span className="badge bg-purple-900/50 text-purple-300">{s.topicLabel}</span>}
                  </div>
                  <p className="text-sm text-gray-200">{s.content}</p>
                </div>
              ))}
            </div>

            <h3 className="font-medium mb-4 mt-8">AI-fragor</h3>
            <div className="space-y-3">
              {aiQuestions.map((q) => (
                <div key={q.id} className="card">
                  <span className="badge bg-blue-900/50 text-blue-300 mb-2">{QUESTION_CATEGORY_LABELS[q.category]}</span>
                  <p className="text-sm font-medium text-gray-200">{q.question}</p>
                  <p className="text-xs text-gray-500 mt-1">{q.context}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-4">Quotable Moments ({quotes.length})</h3>
            <div className="space-y-4">
              {quotes.sort((a, b) => b.impactScore - a.impactScore).map((q) => (
                <div key={q.id} className="card border-l-4 border-blue-500">
                  <blockquote className="text-sm italic text-gray-200 mb-2">&ldquo;{q.quote}&rdquo;</blockquote>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-blue-400">- {q.speakerName}</span>
                    <span className="badge bg-gray-800 text-gray-400">{QUOTE_CATEGORY_LABELS[q.category]}</span>
                    <span className="text-xs text-gray-500">Impact: {q.impactScore}/10</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{q.context}</p>
                </div>
              ))}
              {quotes.length === 0 && <p className="text-sm text-gray-500">Inga citat extraherade</p>}
            </div>
          </div>
        </div>
      )}

      {/* Audience */}
      {activeView === 'audience' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium mb-4">Alla publikfragor ({audienceQuestions.length})</h3>
            <div className="space-y-3">
              {[...audienceQuestions].sort((a, b) => b.votes - a.votes).map((q) => (
                <div key={q.id} className="card flex items-start gap-3">
                  <div className="text-center min-w-[40px]">
                    <div className="text-lg font-bold text-blue-400">{q.votes}</div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-200">{q.text}</p>
                    {q.authorName && <p className="text-xs text-gray-500 mt-1">- {q.authorName}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-4">Frageteman</h3>
            <div className="space-y-4">
              {clusters.length === 0 && <p className="text-sm text-gray-500">Inga kluster genererade</p>}
              {clusters.map((c) => (
                <div key={c.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">{c.theme}</h4>
                    <span className="badge bg-gray-700 text-gray-300">Prio {c.priority}</span>
                  </div>
                  <p className="text-sm text-gray-400">{c.summary}</p>
                  <p className="text-xs text-gray-500 mt-2">{c.questionIds.length} fragor</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Engagement & Speaker Analytics */}
      {activeView === 'engagement' && (
        <div className="space-y-6">
          {/* Engagement overview */}
          {engagement && (
            <div className="card">
              <h3 className="font-medium mb-4">Engagemangsoverblick</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${engagement.averageTemperature > 60 ? 'text-red-400' : 'text-blue-400'}`}>
                    {engagement.averageTemperature.toFixed(0)}
                  </div>
                  <div className="text-xs text-gray-400">Snitttemperatur</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-400">{engagement.peakMoments.length}</div>
                  <div className="text-xs text-gray-400">Peak-moment</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-400">
                    {Object.values(engagement.totalReactions).reduce((a, b) => a + b, 0)}
                  </div>
                  <div className="text-xs text-gray-400">Totala reaktioner</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-400">{engagement.snapshots.length}</div>
                  <div className="text-xs text-gray-400">Datapunkter</div>
                </div>
              </div>

              {/* Reaction breakdown */}
              <h4 className="text-sm font-medium mb-3">Reaktioner</h4>
              <div className="flex flex-wrap gap-4 mb-6">
                {(Object.entries(engagement.totalReactions) as Array<[ReactionType, number]>)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                      <span className="text-xl">{REACTION_EMOJIS[type]}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                  ))}
              </div>

              {/* Temperature timeline (text-based) */}
              {engagement.snapshots.length > 0 && (
                <>
                  <h4 className="text-sm font-medium mb-3">Temperaturforlopp</h4>
                  <div className="flex items-end gap-px h-20 mb-2">
                    {engagement.snapshots.slice(-60).map((s, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-t ${
                          s.temperature > 70 ? 'bg-red-500' : s.temperature > 40 ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}
                        style={{ height: `${s.temperature}%` }}
                        title={`${formatTimestamp(s.timestamp)}: ${s.temperature}`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Start</span>
                    <span>Slut</span>
                  </div>
                </>
              )}

              {/* Peak moments */}
              {engagement.peakMoments.length > 0 && (
                <>
                  <h4 className="text-sm font-medium mb-3 mt-6">Peak-moment</h4>
                  <div className="space-y-2">
                    {engagement.peakMoments.map((peak, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2">
                        <span className="text-xs text-gray-500">{formatTimestamp(peak.timestamp)}</span>
                        <div className="flex-1">
                          <div className="h-2 bg-gray-900 rounded-full">
                            <div
                              className="h-2 bg-red-500 rounded-full"
                              style={{ width: `${peak.temperature}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-bold text-red-400">{peak.temperature}</span>
                        <span className="text-xs text-gray-400">{peak.reason}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Speaker analytics */}
          <div className="card">
            <h3 className="font-medium mb-4">Talaranalys</h3>
            {speakerAnalytics.length === 0 && <p className="text-sm text-gray-500">Ingen talardata tillganglig</p>}
            <div className="space-y-6">
              {speakerAnalytics.map((speaker) => (
                <div key={speaker.speakerId} className="border-b border-gray-800 pb-4 last:border-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: session?.speakers.find((s) => s.id === speaker.speakerId)?.color || '#6B7280' }}
                      />
                      <span className="font-medium">{speaker.speakerName}</span>
                    </div>
                    <span className="text-sm text-gray-400">{speaker.speakingPercentage.toFixed(0)}% av taltiden</span>
                  </div>

                  {/* Speaking time bar */}
                  <div className="w-full bg-gray-800 rounded-full h-3 mb-3">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all"
                      style={{ width: `${speaker.speakingPercentage}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-gray-500">Ord:</span> <span>{speaker.wordCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Segment:</span> <span>{speaker.segmentCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Snittlangd:</span> <span>{(speaker.averageSegmentLengthMs / 1000).toFixed(1)}s</span>
                    </div>
                  </div>

                  {/* Top words */}
                  {speaker.topWords.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">Vanligaste ord:</span>
                      <div className="flex flex-wrap gap-1">
                        {speaker.topWords.slice(0, 8).map((w) => (
                          <span key={w.word} className="badge bg-gray-800 text-gray-300 text-xs">
                            {w.word} ({w.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
