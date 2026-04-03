'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ExportPanel } from '@/components/ui/export-panel';
import {
  Session, AISummary, AIQuestion, AudienceQuestion, QuestionCluster,
  QuotableMoment, SessionEngagement, SpeakerAnalytics,
  QUESTION_CATEGORY_LABELS, QUOTE_CATEGORY_LABELS, REACTION_EMOJIS, ReactionType,
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
    ]).then(([s, sum, q, quo, eng]) => {
      setSession(s); setSummaries(sum);
      setAiQuestions(q.aiQuestions || []); setAudienceQuestions(q.audienceQuestions || []); setClusters(q.clusters || []);
      setQuotes(quo || []); setEngagement(eng.engagement || null); setSpeakerAnalytics(eng.speakerAnalytics || []);
    }).catch(console.error);
  }, [sessionId]);

  const genSummary = async (type: 'chronological' | 'thematic') => {
    setIsGenerating(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
      const data = await r.json();
      setSummaries((p) => [...p, data]);
    } catch {} finally { setIsGenerating(false); }
  };

  const analyzeGaps = async () => {
    setIsAnalyzing(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}/gap-analysis`, { method: 'POST' });
      setGapAnalysis(await r.json());
    } catch {} finally { setIsAnalyzing(false); }
  };

  if (!session) return <div className="flex items-center justify-center min-h-[60vh]"><div style={{ color: 'var(--color-text-muted)' }}>Laddar...</div></div>;

  const intervalSummaries = summaries.filter((s) => s.type === 'interval' || s.type === 'topic_shift');
  const finalSummaries = summaries.filter((s) => s.type === 'final_chronological' || s.type === 'final_thematic');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">{session.title}</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {session.hostName} &middot; {session.createdAt && new Date(session.createdAt).toLocaleDateString('sv-SE')}
          {session.status === 'ended' && <span className="badge-muted ml-2">Avslutad</span>}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
        {[
          { v: session.speakers.length, l: 'Talare', c: 'var(--color-accent)' },
          { v: intervalSummaries.length, l: 'Sammanfattningar', c: 'var(--color-success)' },
          { v: aiQuestions.length, l: 'AI-fragor', c: '#a78bfa' },
          { v: quotes.length, l: 'Citat', c: '#f472b6' },
          { v: audienceQuestions.length, l: 'Publikfragor', c: 'var(--color-warning)' },
          { v: engagement?.averageTemperature.toFixed(0) || '0', l: 'Snitttemp', c: 'var(--color-danger)' },
        ].map((s, i) => (
          <div key={i} className="card text-center py-3">
            <div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar mb-6">
        {[
          { key: 'overview' as const, label: 'Oversikt' },
          { key: 'content' as const, label: 'Innehall & Citat' },
          { key: 'audience' as const, label: 'Publiken' },
          { key: 'engagement' as const, label: 'Engagemang' },
        ].map((t) => (
          <button key={t.key} onClick={() => setActiveView(t.key)} className={`tab-item ${activeView === t.key ? 'tab-item-active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeView === 'overview' && (
        <div className="space-y-5">
          <div className="card">
            <h3 className="font-medium mb-4">Generera analys</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => genSummary('chronological')} disabled={isGenerating} className="btn-primary text-sm">Kronologisk</button>
              <button onClick={() => genSummary('thematic')} disabled={isGenerating} className="btn-secondary text-sm">Tematisk</button>
              <button onClick={analyzeGaps} disabled={isAnalyzing} className="btn-secondary text-sm" style={{ borderColor: 'rgba(245,158,11,0.3)', color: 'var(--color-warning)' }}>
                {isAnalyzing ? 'Analyserar...' : 'Vad har vi missat?'}
              </button>
            </div>
          </div>

          {finalSummaries.map((s) => (
            <div key={s.id} className="card">
              <h3 className="font-medium mb-3">{s.type === 'final_chronological' ? 'Kronologisk' : 'Tematisk'} sammanfattning</h3>
              <div className="leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>{s.content}</div>
            </div>
          ))}

          {gapAnalysis && (
            <div className="card-glow" style={{ borderColor: 'var(--color-warning)' }}>
              <h3 className="font-bold mb-3" style={{ color: 'var(--color-warning)' }}>Vad har vi missat?</h3>
              <div className="leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>{gapAnalysis.content}</div>
            </div>
          )}

          {session.speakers.length > 0 && (
            <div className="card">
              <h3 className="font-medium mb-3">Talare</h3>
              <div className="flex flex-wrap gap-2">
                {session.speakers.map((sp) => (
                  <div key={sp.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sp.color }} />
                    <span className="text-sm">{sp.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export */}
          <ExportPanel
            sessionId={sessionId}
            sessionTitle={session.title}
            transcript=""
            summaries={summaries}
            aiQuestions={aiQuestions}
            quotes={quotes}
            audienceQuestions={audienceQuestions}
          />
        </div>
      )}

      {/* Content & Quotes */}
      {activeView === 'content' && (
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <h3 className="font-medium mb-3">Sammanfattningar</h3>
            <div className="space-y-3">
              {intervalSummaries.map((s) => (
                <div key={s.id} className="card">
                  <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    {formatTimestamp(s.coveringFrom)} - {formatTimestamp(s.coveringTo)}
                    {s.topicLabel && <span className="badge-accent">{s.topicLabel}</span>}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{s.content}</p>
                </div>
              ))}
              <h3 className="font-medium mb-3 mt-6">AI-fragor</h3>
              {aiQuestions.map((q) => (
                <div key={q.id} className="card">
                  <span className="badge-accent text-xs mb-2">{QUESTION_CATEGORY_LABELS[q.category]}</span>
                  <p className="font-medium">{q.question}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{q.context}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-medium mb-3">Quotable Moments ({quotes.length})</h3>
            <div className="space-y-3">
              {quotes.sort((a,b) => b.impactScore - a.impactScore).map((q) => (
                <div key={q.id} className="quote-block">
                  <blockquote className="italic leading-relaxed">&ldquo;{q.quote}&rdquo;</blockquote>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>— {q.speakerName}</span>
                    <span className="badge-muted text-xs">{QUOTE_CATEGORY_LABELS[q.category]}</span>
                  </div>
                </div>
              ))}
              {quotes.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Inga citat extraherade</p>}
            </div>
          </div>
        </div>
      )}

      {/* Audience */}
      {activeView === 'audience' && (
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <h3 className="font-medium mb-3">Publikfragor ({audienceQuestions.length})</h3>
            <div className="space-y-2">
              {[...audienceQuestions].sort((a,b) => b.votes - a.votes).map((q) => (
                <div key={q.id} className="card flex items-start gap-3 py-3">
                  <div className="text-xl font-bold min-w-[40px] text-center" style={{ color: 'var(--color-accent)' }}>{q.votes}</div>
                  <div>
                    <p className="text-sm">{q.text}</p>
                    {q.authorName && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>— {q.authorName}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-medium mb-3">Frageteman</h3>
            {clusters.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Inga kluster</p>}
            {clusters.map((c) => (
              <div key={c.id} className="card mb-2">
                <div className="flex justify-between mb-1"><span className="font-medium text-sm">{c.theme}</span><span className="badge-muted text-xs">Prio {c.priority}</span></div>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{c.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Engagement */}
      {activeView === 'engagement' && (
        <div className="space-y-5">
          {engagement && (
            <div className="card">
              <h3 className="font-medium mb-4">Engagemang</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="text-center"><div className="text-2xl font-bold" style={{ color: 'var(--color-accent)' }}>{engagement.averageTemperature.toFixed(0)}</div><div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Snitttemp</div></div>
                <div className="text-center"><div className="text-2xl font-bold" style={{ color: 'var(--color-success)' }}>{engagement.peakMoments.length}</div><div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Peak-moment</div></div>
                <div className="text-center"><div className="text-2xl font-bold" style={{ color: '#a78bfa' }}>{Object.values(engagement.totalReactions).reduce((a,b) => a+b, 0)}</div><div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Reaktioner</div></div>
                <div className="text-center"><div className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>{engagement.snapshots.length}</div><div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Datapunkter</div></div>
              </div>

              {/* Reactions */}
              <div className="flex flex-wrap gap-2 mb-6">
                {(Object.entries(engagement.totalReactions) as Array<[ReactionType, number]>).sort((a,b)=>b[1]-a[1]).map(([type,count]) => (
                  <div key={type} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                    <span className="text-xl">{REACTION_EMOJIS[type]}</span><span className="font-bold">{count}</span>
                  </div>
                ))}
              </div>

              {/* Temperature timeline */}
              {engagement.snapshots.length > 0 && (
                <>
                  <h4 className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>Temperaturforlopp</h4>
                  <div className="flex items-end gap-px h-16 mb-2 rounded-lg overflow-hidden" style={{ background: 'var(--color-surface-raised)' }}>
                    {engagement.snapshots.slice(-80).map((s, i) => (
                      <div key={i} className={`flex-1 rounded-t transition-all ${s.temperature > 70 ? 'bg-red-500' : s.temperature > 40 ? 'bg-yellow-500' : 'bg-indigo-500'}`} style={{ height: `${s.temperature}%`, opacity: 0.6 + (s.temperature/100) * 0.4 }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Speaker analytics */}
          <div className="card">
            <h3 className="font-medium mb-4">Talaranalys</h3>
            {speakerAnalytics.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Ingen data</p>}
            <div className="space-y-5">
              {speakerAnalytics.map((sp) => (
                <div key={sp.speakerId}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: session?.speakers.find((s) => s.id === sp.speakerId)?.color || 'var(--color-text-muted)' }} />
                      <span className="font-medium">{sp.speakerName}</span>
                    </div>
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{sp.speakingPercentage.toFixed(0)}%</span>
                  </div>
                  <div className="temperature-bar mb-2"><div className="temperature-fill temperature-fill-cool" style={{ width: `${sp.speakingPercentage}%` }} /></div>
                  <div className="flex gap-4 text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    <span>{sp.wordCount} ord</span>
                    <span>{sp.segmentCount} segment</span>
                    <span>snitt {(sp.averageSegmentLengthMs/1000).toFixed(1)}s</span>
                  </div>
                  {sp.topWords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sp.topWords.slice(0, 6).map((w) => (
                        <span key={w.word} className="badge-muted text-xs">{w.word} ({w.count})</span>
                      ))}
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
