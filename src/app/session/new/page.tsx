'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SESSION_SETTINGS, SummaryMode } from '@/types';

export default function NewSessionPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    context: '',
    hostName: '',
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
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          context: form.context,
          hostName: form.hostName,
        }),
      });

      if (!response.ok) throw new Error('Kunde inte skapa session');

      const session = await response.json();
      router.push(`/session/${session.id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Kunde inte skapa sessionen.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8">Skapa ny session</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Sessionstitel *</label>
          <input
            type="text"
            className="input"
            placeholder="t.ex. Panelsamtal om AI i skolan"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Ditt namn (vard) *</label>
          <input
            type="text"
            className="input"
            placeholder="t.ex. Anna Andersson"
            value={form.hostName}
            onChange={(e) => setForm({ ...form, hostName: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Beskrivning</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Kort beskrivning som visas for publiken"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Kontext for AI</label>
          <textarea
            className="textarea"
            rows={5}
            placeholder="Beskriv amnet, bakgrunden och vad samtalet ska handla om. Ju mer kontext desto battre AI-forslag."
            value={form.context}
            onChange={(e) => setForm({ ...form, context: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Anvands av AI:n for sammanfattningar, fragor och citat-extraktion.</p>
        </div>

        <div className="card">
          <h3 className="font-medium mb-4">AI-installningar</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Sprak</label>
              <select className="input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                <option value="sv-SE">Svenska</option>
                <option value="en-US">Engelska</option>
                <option value="nb-NO">Norska</option>
                <option value="da-DK">Danska</option>
                <option value="fi-FI">Finska</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Sammanfattningslage</label>
              <select
                className="input"
                value={form.summaryMode}
                onChange={(e) => setForm({ ...form, summaryMode: e.target.value as SummaryMode })}
              >
                <option value="auto">Auto (amnesbyte + intervall)</option>
                <option value="interval">Enbart tidsintervall</option>
                <option value="topic_shift">Enbart amnesbyte</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Auto: Sammanfattar bade vid amnesbyten och pa fasta intervall. Rekommenderat.
              </p>
            </div>

            {(form.summaryMode === 'interval' || form.summaryMode === 'auto') && (
              <div>
                <label className="block text-sm text-gray-300 mb-1">Sammanfattningsintervall (sekunder)</label>
                <input
                  type="number"
                  className="input"
                  min={30}
                  max={300}
                  value={form.summaryInterval}
                  onChange={(e) => setForm({ ...form, summaryInterval: parseInt(e.target.value) })}
                />
              </div>
            )}

            <div className="space-y-3">
              {[
                { id: 'aiInsights', label: 'AI-genererade fordjupningsfragor', key: 'aiInsights' as const },
                { id: 'punctuation', label: 'Automatisk interpunktion och formatering', key: 'enablePunctuation' as const },
                { id: 'quotes', label: 'Citat-extraktion (quotable moments)', key: 'enableQuoteExtraction' as const },
              ].map((option) => (
                <div key={option.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={option.id}
                    checked={form[option.key]}
                    onChange={(e) => setForm({ ...form, [option.key]: e.target.checked })}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700"
                  />
                  <label htmlFor={option.id} className="text-sm text-gray-300">{option.label}</label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isCreating || !form.title || !form.hostName}
          className="btn-primary w-full text-center"
        >
          {isCreating ? 'Skapar session...' : 'Skapa session'}
        </button>
      </form>
    </div>
  );
}
