'use client';

import { useState } from 'react';
import { Speaker, SpeakerBio } from '@/types';

interface SpeakerManagerProps {
  speakers: Speaker[];
  speakerBios: SpeakerBio[];
  onRenameSpeaker: (speakerId: string, newName: string) => void;
}

/**
 * Shows detected speakers and lets moderator name/rename them.
 * Matches unnamed speakers (Talare 1, Guest_0) against briefing bios.
 */
export function SpeakerManager({ speakers, speakerBios, onRenameSpeaker }: SpeakerManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  if (speakers.length === 0) return null;

  const unnamedSpeakers = speakers.filter(
    (s) => s.name.startsWith('Talare ') || s.name.startsWith('Guest_') || s.name.startsWith('Speaker_')
  );

  const startEdit = (speaker: Speaker) => {
    setEditingId(speaker.id);
    setEditValue(speaker.name);
  };

  const saveEdit = (speakerId: string) => {
    if (editValue.trim()) {
      onRenameSpeaker(speakerId, editValue.trim());
    }
    setEditingId(null);
  };

  // Unassigned bios (not yet matched to a detected speaker)
  const assignedNames = new Set(speakers.filter((s) => !s.name.startsWith('Talare ') && !s.name.startsWith('Guest_')).map((s) => s.name));
  const unassignedBios = speakerBios.filter((b) => !assignedNames.has(b.name));

  return (
    <div className="card" style={{ padding: '0.75rem 1rem' }}>
      <h3 className="text-xs font-bold mb-2" style={{ color: 'var(--color-text-secondary)' }}>TALARE</h3>

      {/* Unnamed speakers that need identification */}
      {unnamedSpeakers.length > 0 && (
        <div className="mb-2 p-2 rounded-lg" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}>
          <p className="text-xs mb-1.5" style={{ color: 'var(--color-warning)' }}>
            {unnamedSpeakers.length} okand{unnamedSpeakers.length > 1 ? 'a' : ''} talare — klicka for att namnge
          </p>
          {unnamedSpeakers.map((speaker) => (
            <div key={speaker.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: speaker.color }} />
              {editingId === speaker.id ? (
                <div className="flex gap-1 flex-1">
                  <input
                    className="input text-xs py-1 flex-1"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(speaker.id)}
                    autoFocus
                    placeholder="Namn..."
                  />
                  <button onClick={() => saveEdit(speaker.id)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--color-success)', color: 'white' }}>OK</button>
                </div>
              ) : (
                <button onClick={() => startEdit(speaker)} className="text-xs text-left flex-1 hover:underline" style={{ color: 'var(--color-warning)' }}>
                  {speaker.name} — klicka for att namnge
                </button>
              )}
              {/* Quick-assign from bios */}
              {editingId !== speaker.id && unassignedBios.length > 0 && (
                <div className="flex gap-1">
                  {unassignedBios.slice(0, 3).map((bio) => (
                    <button
                      key={bio.name}
                      onClick={() => onRenameSpeaker(speaker.id, bio.name)}
                      className="text-xs px-1.5 py-0.5 rounded transition-all"
                      style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                      title={`Tilldela som ${bio.name}`}
                    >
                      {bio.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* All speakers list */}
      <div className="space-y-1">
        {speakers.filter((s) => !unnamedSpeakers.includes(s)).map((speaker) => (
          <div key={speaker.id} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: speaker.color }} />
            {editingId === speaker.id ? (
              <div className="flex gap-1 flex-1">
                <input
                  className="input text-xs py-0.5 flex-1"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit(speaker.id)}
                  autoFocus
                />
                <button onClick={() => saveEdit(speaker.id)} className="text-xs px-1.5 rounded" style={{ color: 'var(--color-success)' }}>OK</button>
                <button onClick={() => setEditingId(null)} className="text-xs px-1.5 rounded" style={{ color: 'var(--color-text-muted)' }}>X</button>
              </div>
            ) : (
              <button onClick={() => startEdit(speaker)} className="text-xs text-left flex-1 hover:opacity-70 transition-opacity" style={{ color: 'var(--color-text-primary)' }}>
                {speaker.name}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
