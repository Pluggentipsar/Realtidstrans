'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SESSION_FORMAT_LABELS, SessionFormat } from '@/types';

interface SessionListItem {
  id: string;
  code: string;
  title: string;
  hostName: string;
  status: string;
  format: SessionFormat;
  speakerCount: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sessions/list')
      .then((r) => r.json())
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const statusColors: Record<string, string> = {
    setup: 'var(--color-text-muted)',
    soundcheck: 'var(--color-warning)',
    live: 'var(--color-danger)',
    paused: 'var(--color-warning)',
    ended: 'var(--color-success)',
  };

  const statusLabels: Record<string, string> = {
    setup: 'Forberedelse',
    soundcheck: 'Ljudprov',
    live: 'Live',
    paused: 'Pausad',
    ended: 'Avslutad',
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Sessioner</h1>
        <Link href="/session/new" className="btn-primary text-sm">Ny session</Link>
      </div>

      {loading && <p style={{ color: 'var(--color-text-muted)' }}>Laddar...</p>}

      {!loading && sessions.length === 0 && (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">&#x1F3A4;</div>
          <p style={{ color: 'var(--color-text-secondary)' }}>Inga sessioner annu.</p>
          <Link href="/session/new" className="btn-primary text-sm mt-4 inline-block">Skapa din forsta session</Link>
        </div>
      )}

      <div className="space-y-3">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={s.status === 'ended' ? `/session/${s.id}/dashboard` : `/session/${s.id}/moderator`}
            className="card block transition-all hover:border-indigo-500/30"
            style={{ padding: '1rem 1.25rem' }}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium">{s.title}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${statusColors[s.status]}20`, color: statusColors[s.status], border: `1px solid ${statusColors[s.status]}40` }}>
                  {s.status === 'live' && '\u25CF '}{statusLabels[s.status] || s.status}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <span>{s.hostName}</span>
              <span>{SESSION_FORMAT_LABELS[s.format] || s.format}</span>
              <span>{s.speakerCount} talare</span>
              <span className="font-mono">{s.code}</span>
              <span>{new Date(s.createdAt).toLocaleDateString('sv-SE')}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
