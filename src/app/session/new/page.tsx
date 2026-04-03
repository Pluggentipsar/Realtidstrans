'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_SESSION_SETTINGS,
  DEFAULT_BRIEFING,
  SummaryMode,
  SessionFormat,
  SESSION_FORMAT_LABELS,
  AgendaItem,
  PreparedQuestion,
  SpeakerBio,
} from '@/types';
import { generateId } from '@/lib/utils';

export default function NewSessionPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'briefing' | 'speakers' | 'questions' | 'settings'>('basic');

  // Basic info
  const [title, setTitle] = useState('');
  const [hostName, setHostName] = useState('');
  const [description, setDescription] = useState('');

  // Briefing
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [format, setFormat] = useState<SessionFormat>('panel');
  const [backgroundMaterial, setBackgroundMaterial] = useState('');
  const [avoidTopics, setAvoidTopics] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');

  // Agenda
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);

  // Prepared questions
  const [preparedQuestions, setPreparedQuestions] = useState<PreparedQuestion[]>([]);

  // Speaker bios
  const [speakerBios, setSpeakerBios] = useState<SpeakerBio[]>([]);

  // Settings
  const [language, setLanguage] = useState(DEFAULT_SESSION_SETTINGS.language);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>(DEFAULT_SESSION_SETTINGS.summaryMode);
  const [summaryInterval, setSummaryInterval] = useState(DEFAULT_SESSION_SETTINGS.summaryIntervalSeconds);
  const [aiInsights, setAiInsights] = useState(DEFAULT_SESSION_SETTINGS.aiInsightsEnabled);
  const [enableQuoteExtraction, setEnableQuoteExtraction] = useState(DEFAULT_SESSION_SETTINGS.enableQuoteExtraction);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          context: topic, // Legacy field
          hostName,
          briefing: {
            topic,
            goal,
            format,
            agenda,
            preparedQuestions,
            speakerBios,
            backgroundMaterial,
            avoidTopics,
            customInstructions,
          },
        }),
      });
      if (!response.ok) throw new Error('fail');
      const session = await response.json();
      // Go to soundcheck if speakers exist, otherwise straight to moderator
      const hasSpeakers = speakerBios.length > 0;
      router.push(`/session/${session.id}/${hasSpeakers ? 'soundcheck' : 'moderator'}`);
    } catch { alert('Kunde inte skapa sessionen.'); } finally { setIsCreating(false); }
  };

  // Helpers
  const addAgendaItem = () => setAgenda([...agenda, { id: generateId(), title: '', description: '', order: agenda.length + 1 }]);
  const removeAgendaItem = (id: string) => setAgenda(agenda.filter((a) => a.id !== id));
  const updateAgendaItem = (id: string, updates: Partial<AgendaItem>) => setAgenda(agenda.map((a) => a.id === id ? { ...a, ...updates } : a));

  const addQuestion = () => setPreparedQuestions([...preparedQuestions, { id: generateId(), question: '', priority: 'nice_to_ask', status: 'pending' }]);
  const removeQuestion = (id: string) => setPreparedQuestions(preparedQuestions.filter((q) => q.id !== id));
  const updateQuestion = (id: string, updates: Partial<PreparedQuestion>) => setPreparedQuestions(preparedQuestions.map((q) => q.id === id ? { ...q, ...updates } : q));

  const addSpeaker = () => setSpeakerBios([...speakerBios, { name: '', title: '', organization: '', expertise: '' }]);
  const removeSpeaker = (idx: number) => setSpeakerBios(speakerBios.filter((_, i) => i !== idx));
  const updateSpeaker = (idx: number, updates: Partial<SpeakerBio>) => setSpeakerBios(speakerBios.map((s, i) => i === idx ? { ...s, ...updates } : s));

  const tabs = [
    { key: 'basic' as const, label: 'Grundinfo', required: true },
    { key: 'briefing' as const, label: 'Briefing' },
    { key: 'speakers' as const, label: `Talare (${speakerBios.length})` },
    { key: 'questions' as const, label: `Fragor (${preparedQuestions.length})` },
    { key: 'settings' as const, label: 'Installningar' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Ny session</h1>
      <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        Ju mer kontext du ger, desto vassare blir AI:ns fragor och insikter.
      </p>

      {/* Tab nav */}
      <div className="tab-bar mb-6">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`tab-item ${activeTab === t.key ? 'tab-item-active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* === BASIC === */}
        {activeTab === 'basic' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Titel *</label>
              <input className="input" placeholder="t.ex. Panelsamtal om AI i skolan" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Ditt namn (moderator) *</label>
              <input className="input" placeholder="t.ex. Anna Andersson" value={hostName} onChange={(e) => setHostName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Format</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(SESSION_FORMAT_LABELS) as Array<[SessionFormat, string]>).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFormat(key)} className="px-3 py-2 rounded-lg text-sm transition-all" style={{ background: format === key ? 'var(--color-accent)' : 'var(--color-surface-raised)', color: format === key ? 'white' : 'var(--color-text-secondary)', border: `1px solid ${format === key ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Beskrivning (visas for publiken)</label>
              <textarea className="textarea" rows={2} placeholder="Kort beskrivning..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        )}

        {/* === BRIEFING === */}
        {activeTab === 'briefing' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Amne — vad handlar sessionen om?</label>
              <textarea className="textarea" rows={2} placeholder="t.ex. Hur AI paverkar grundskolan — pedagogik, integritet och likvardighet" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Mal — vad ska publiken ta med sig?</label>
              <textarea className="textarea" rows={2} placeholder="t.ex. Forstaelse for bade mojligheter och risker med AI i klassrummet" value={goal} onChange={(e) => setGoal(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Bakgrundsmaterial</label>
              <textarea className="textarea" rows={4} placeholder="Rapporter, statistik, artiklar, citat — allt AI:n bor kanna till for att stalla bra fragor" value={backgroundMaterial} onChange={(e) => setBackgroundMaterial(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Klistra in relevant fakta, data eller lankar. AI:n anvander detta for att vara val insatt.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Dagordning / Agenda</label>
              {agenda.map((item, i) => (
                <div key={item.id} className="flex gap-2 mb-2">
                  <span className="text-sm font-mono mt-2" style={{ color: 'var(--color-text-muted)' }}>{i+1}.</span>
                  <div className="flex-1 space-y-1">
                    <input className="input text-sm" placeholder="Amne/rubrik" value={item.title} onChange={(e) => updateAgendaItem(item.id, { title: e.target.value })} />
                    <div className="flex gap-2">
                      <input className="input text-sm flex-1" placeholder="Beskrivning (valfritt)" value={item.description} onChange={(e) => updateAgendaItem(item.id, { description: e.target.value })} />
                      <input className="input text-sm" style={{ width: '80px' }} placeholder="min" type="number" value={item.durationMinutes || ''} onChange={(e) => updateAgendaItem(item.id, { durationMinutes: parseInt(e.target.value) || undefined })} />
                    </div>
                  </div>
                  <button type="button" onClick={() => removeAgendaItem(item.id)} className="btn-ghost text-xs mt-2" style={{ color: 'var(--color-danger)' }}>Ta bort</button>
                </div>
              ))}
              <button type="button" onClick={addAgendaItem} className="btn-ghost text-sm" style={{ color: 'var(--color-accent)' }}>+ Lagg till punkt</button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Undvik dessa amnen</label>
              <input className="input" placeholder="t.ex. Personliga fragor om familj, pagaende rattsfall" value={avoidTopics} onChange={(e) => setAvoidTopics(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Sarskilda instruktioner till AI:n</label>
              <textarea className="textarea" rows={2} placeholder="t.ex. Fokusera pa praktiska exempel, undvik akademiskt sprak" value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)} />
            </div>
          </div>
        )}

        {/* === SPEAKERS === */}
        {activeTab === 'speakers' && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Beskriv talarna sa AI:n kan referera till deras expertis och stalla riktade fragor.
            </p>
            {speakerBios.map((bio, idx) => (
              <div key={idx} className="card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Talare {idx+1}</span>
                  <button type="button" onClick={() => removeSpeaker(idx)} className="btn-ghost text-xs" style={{ color: 'var(--color-danger)' }}>Ta bort</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" placeholder="Namn" value={bio.name} onChange={(e) => updateSpeaker(idx, { name: e.target.value })} />
                  <input className="input text-sm" placeholder="Titel / Roll" value={bio.title} onChange={(e) => updateSpeaker(idx, { title: e.target.value })} />
                </div>
                <input className="input text-sm" placeholder="Organisation" value={bio.organization} onChange={(e) => updateSpeaker(idx, { organization: e.target.value })} />
                <input className="input text-sm" placeholder="Expertomrade — vad ar de kanda for?" value={bio.expertise} onChange={(e) => updateSpeaker(idx, { expertise: e.target.value })} />
                <input className="input text-sm" placeholder="Kand standpunkt i fragan (valfritt)" value={bio.stance || ''} onChange={(e) => updateSpeaker(idx, { stance: e.target.value })} />
                <textarea className="textarea text-sm" rows={2} placeholder="Ovrig bakgrund (valfritt)" value={bio.background || ''} onChange={(e) => updateSpeaker(idx, { background: e.target.value })} />
              </div>
            ))}
            <button type="button" onClick={addSpeaker} className="btn-secondary text-sm w-full">+ Lagg till talare</button>
          </div>
        )}

        {/* === PREPARED QUESTIONS === */}
        {activeTab === 'questions' && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Forberedda fragor visas for AI:n som kontext och i moderatorvyn som en checklista.
            </p>
            {preparedQuestions.map((q) => (
              <div key={q.id} className="card" style={{ padding: '0.75rem' }}>
                <div className="flex gap-2 mb-2">
                  <textarea className="textarea text-sm flex-1" rows={2} placeholder="Fragan..." value={q.question} onChange={(e) => updateQuestion(q.id, { question: e.target.value })} />
                  <button type="button" onClick={() => removeQuestion(q.id)} className="btn-ghost text-xs self-start" style={{ color: 'var(--color-danger)' }}>X</button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input className="input text-xs" style={{ width: '140px' }} placeholder="Till (valfritt)" value={q.targetSpeaker || ''} onChange={(e) => updateQuestion(q.id, { targetSpeaker: e.target.value || undefined })} />
                  {(['must_ask', 'nice_to_ask', 'if_time'] as const).map((p) => (
                    <button key={p} type="button" onClick={() => updateQuestion(q.id, { priority: p })} className="px-2 py-0.5 rounded text-xs transition-all" style={{ background: q.priority === p ? (p === 'must_ask' ? 'var(--color-danger)' : 'var(--color-surface-overlay)') : 'var(--color-surface-raised)', color: q.priority === p ? 'white' : 'var(--color-text-muted)', border: `1px solid ${q.priority === p ? 'transparent' : 'var(--color-border)'}` }}>
                      {p === 'must_ask' ? 'Maste stallas' : p === 'nice_to_ask' ? 'Bra att stalla' : 'Om tid finns'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={addQuestion} className="btn-secondary text-sm w-full">+ Lagg till fraga</button>
          </div>
        )}

        {/* === SETTINGS === */}
        {activeTab === 'settings' && (
          <div className="card space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Sprak</label>
                <select className="input text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="sv-SE">Svenska</option>
                  <option value="en-US">Engelska</option>
                  <option value="nb-NO">Norska</option>
                  <option value="da-DK">Danska</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Sammanfattningslage</label>
                <select className="input text-sm" value={summaryMode} onChange={(e) => setSummaryMode(e.target.value as SummaryMode)}>
                  <option value="auto">Auto</option>
                  <option value="interval">Tidsintervall</option>
                  <option value="topic_shift">Amnesbyte</option>
                </select>
              </div>
            </div>
            {(summaryMode === 'interval' || summaryMode === 'auto') && (
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Intervall (sekunder)</label>
                <input type="number" className="input text-sm" min={30} max={300} value={summaryInterval} onChange={(e) => setSummaryInterval(parseInt(e.target.value))} />
              </div>
            )}
            <div className="space-y-2.5">
              {[
                { label: 'AI-fordjupningsfragor', checked: aiInsights, onChange: setAiInsights },
                { label: 'Citat-extraktion', checked: enableQuoteExtraction, onChange: setEnableQuoteExtraction },
              ].map((opt) => (
                <label key={opt.label} className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input type="checkbox" checked={opt.checked} onChange={(e) => opt.onChange(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-indigo-500" style={{ background: opt.checked ? undefined : 'var(--color-surface-overlay)', border: '1px solid var(--color-border)' }} />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="mt-8 flex gap-3">
          <button type="submit" disabled={isCreating || !title || !hostName} className="btn-primary flex-1 py-3 text-base">
            {isCreating ? 'Skapar...' : 'Skapa session'}
          </button>
        </div>

        {/* Completeness indicator */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {[
            { filled: !!title && !!hostName, label: 'Grundinfo' },
            { filled: !!topic, label: 'Amne' },
            { filled: speakerBios.length > 0, label: 'Talare' },
            { filled: agenda.length > 0, label: 'Dagordning' },
            { filled: preparedQuestions.length > 0, label: 'Fragor' },
            { filled: !!backgroundMaterial, label: 'Bakgrund' },
          ].map((item) => (
            <span key={item.label} className="text-xs px-2 py-0.5 rounded-full" style={{ background: item.filled ? 'rgba(34,197,94,0.15)' : 'var(--color-surface-raised)', color: item.filled ? 'var(--color-success)' : 'var(--color-text-muted)', border: `1px solid ${item.filled ? 'rgba(34,197,94,0.3)' : 'var(--color-border-subtle)'}` }}>
              {item.filled ? '\u2713' : '\u25CB'} {item.label}
            </span>
          ))}
        </div>
      </form>
    </div>
  );
}
