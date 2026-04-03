'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsJoining(true);
    try {
      const response = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Kunde inte ansluta');
        return;
      }
      const { sessionId } = await response.json();
      router.push(`/session/${sessionId}/audience`);
    } catch {
      setError('Natverksfel. Forsok igen.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-20 text-center">
      <div className="mb-10">
        <div className="text-5xl mb-4">&#x1F4F1;</div>
        <h1 className="text-2xl font-bold mb-2">Ga med i session</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Ange den 6-siffriga koden fran presentatoren
        </p>
      </div>

      <form onSubmit={handleJoin} className="space-y-4">
        <input
          type="text"
          className="input text-center font-mono tracking-[0.4em] py-5"
          style={{ fontSize: '2rem', letterSpacing: '0.4em', background: 'var(--color-surface)', borderColor: code.length === 6 ? 'var(--color-accent)' : 'var(--color-border)' }}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError('');
          }}
          maxLength={6}
          inputMode="numeric"
          autoFocus
        />

        {/* Visual dots showing progress */}
        <div className="flex justify-center gap-2">
          {[0,1,2,3,4,5].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full transition-all duration-200"
              style={{
                background: i < code.length ? 'var(--color-accent)' : 'var(--color-border)',
                transform: i < code.length ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={code.length !== 6 || isJoining}
          className="btn-primary w-full py-3.5 text-base"
        >
          {isJoining ? 'Ansluter...' : 'Anslut'}
        </button>
      </form>
    </div>
  );
}
