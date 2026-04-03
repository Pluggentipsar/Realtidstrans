'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SESSION_SETTINGS, SummaryMode } from '@/types';

export default function NewSessionPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', context: '', hostName: '',
    language: DEFAULT_SESSION_SETTINGS.language,
    summaryMode: DEFAULT_SESSION_SETTINGS.summaryMode as SummaryMode,
    summaryInterval: DEFAULT_SESSION_SETTINGS.summaryIntervalSeconds,
    aiInsights: DEFAULT_SESSION_SETTINGS.aiInsightsEnabled,
    enablePunctuation: DEFAULT_SESSION_SETTINGS.enablePunctuation,
    enableQuoteExtraction: DEFAULT_SESSION_SETTINGS.enableQuoteExtraction,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, description: form.description, context: form.context, hostName: form.hostName }),
      });
      if (!response.ok) throw new Error('fail');
      const session = await response.json();
      router.push(`/session/${session.id}`);
    } catch { alert('Kunde inte skapa sessionen.'); } finally { setIsCreating(false); }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">Ny session</h1>
      <p className="mb-8" style={{ color: 'var(--color-text-secondary)' }}>
        Konfigurera din session. AI:n anvander kontexten for battre insikter.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Titel *</label>
          <input className="input" placeholder="t.ex. Panelsamtal om AI i skolan" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Ditt namn *</label>
          <input className="input" placeholder="t.ex. Anna Andersson" value={form.hostName} onChange={(e) => setForm({ ...form, hostName: e.target.value })} required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Beskrivning</label>
          <textarea className="textarea" rows={2} placeholder="Kort beskrivning som visas for publiken" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Kontext for AI</label>
          <textarea className="textarea" rows={4} placeholder="Beskriv amnet, bakgrunden, deltagare och fokusomraden. Ju mer desto battre." value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} />
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Anvands for sammanfattningar, fragor och citatextraktion.</p>
        </div>

        <div className="card">
          <h3 className="font-medium mb-4">Installningar</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Sprak</label>
              <select className="input text-sm" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                <option value="sv-SE">Svenska</option>
                <option value="en-US">Engelska</option>
                <option value="nb-NO">Norska</option>
                <option value="da-DK">Danska</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Sammanfattningslage</label>
              <select className="input text-sm" value={form.summaryMode} onChange={(e) => setForm({ ...form, summaryMode: e.target.value as SummaryMode })}>
                <option value="auto">Auto (amne + intervall)</option>
                <option value="interval">Tidsintervall</option>
                <option value="topic_shift">Amnesbyte</option>
              </select>
            </div>
          </div>

          {(form.summaryMode === 'interval' || form.summaryMode === 'auto') && (
            <div className="mb-4">
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Intervall (sekunder)</label>
              <input type="number" className="input text-sm" min={30} max={300} value={form.summaryInterval} onChange={(e) => setForm({ ...form, summaryInterval: parseInt(e.target.value) })} />
            </div>
          )}

          <div className="space-y-2.5">
            {[
              { id: 'ai', label: 'AI-fordjupningsfragor', key: 'aiInsights' as const },
              { id: 'punct', label: 'Automatisk interpunktion', key: 'enablePunctuation' as const },
              { id: 'quote', label: 'Citat-extraktion', key: 'enableQuoteExtraction' as const },
            ].map((opt) => (
              <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input type="checkbox" checked={form[opt.key]} onChange={(e) => setForm({ ...form, [opt.key]: e.target.checked })} className="sr-only peer" />
                  <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-indigo-500" style={{ background: form[opt.key] ? undefined : 'var(--color-surface-overlay)', border: '1px solid var(--color-border)' }} />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-sm group-hover:text-white transition-colors" style={{ color: 'var(--color-text-secondary)' }}>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" disabled={isCreating || !form.title || !form.hostName} className="btn-primary w-full py-3.5 text-base">
          {isCreating ? 'Skapar...' : 'Skapa session'}
        </button>
      </form>
    </div>
  );
}
