'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SESSION_SETTINGS } from '@/types';

export default function NewSessionPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    context: '',
    hostName: '',
    language: DEFAULT_SESSION_SETTINGS.language,
    summaryInterval: DEFAULT_SESSION_SETTINGS.summaryIntervalSeconds,
    smartSummary: DEFAULT_SESSION_SETTINGS.smartSummaryEnabled,
    aiInsights: DEFAULT_SESSION_SETTINGS.aiInsightsEnabled,
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
      alert('Kunde inte skapa sessionen. Försök igen.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Skapa ny session</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Sessionstitel *
          </label>
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
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Ditt namn (värd) *
          </label>
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
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Beskrivning
          </label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Kort beskrivning av sessionen som visas för publiken"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Kontext för AI
          </label>
          <textarea
            className="textarea"
            rows={5}
            placeholder="Beskriv ämnet, bakgrunden och vad samtalet ska handla om. Ju mer kontext desto bättre AI-förslag. T.ex: 'Panelsamtal om hur AI påverkar grundskolan. Paneldeltagare: rektor, lärare, forskare. Fokusområden: pedagogik, integritet, likvärdighet.'"
            value={form.context}
            onChange={(e) => setForm({ ...form, context: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Denna kontext används av AI:n för att generera relevanta sammanfattningar och frågor.
          </p>
        </div>

        <div className="card">
          <h3 className="font-medium mb-4">AI-inställningar</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Språk
              </label>
              <select
                className="input"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="sv-SE">Svenska</option>
                <option value="en-US">Engelska</option>
                <option value="nb-NO">Norska</option>
                <option value="da-DK">Danska</option>
                <option value="fi-FI">Finska</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Sammanfattningsintervall (sekunder)
              </label>
              <input
                type="number"
                className="input"
                min={30}
                max={300}
                value={form.summaryInterval}
                onChange={(e) =>
                  setForm({ ...form, summaryInterval: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="smartSummary"
                checked={form.smartSummary}
                onChange={(e) =>
                  setForm({ ...form, smartSummary: e.target.checked })
                }
                className="w-4 h-4 rounded bg-gray-800 border-gray-700"
              />
              <label htmlFor="smartSummary" className="text-sm text-gray-300">
                Smart sammanfattning (detektera ämnesbyten automatiskt)
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="aiInsights"
                checked={form.aiInsights}
                onChange={(e) =>
                  setForm({ ...form, aiInsights: e.target.checked })
                }
                className="w-4 h-4 rounded bg-gray-800 border-gray-700"
              />
              <label htmlFor="aiInsights" className="text-sm text-gray-300">
                AI-genererade fördjupningsfrågor
              </label>
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
