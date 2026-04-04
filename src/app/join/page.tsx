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
      setError('Nätverksfel. Försök igen.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 pt-28 pb-16 text-center">
      <div className="mb-12">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center text-3xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>&#x1F4F1;</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-3" style={{ letterSpacing: '-0.02em' }}>Gå med i session</h1>
        <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
          Ange den 6-siffriga koden från presentatören
        </p>
      </div>

      <form onSubmit={handleJoin} className="space-y-6">
        <input
          type="text"
          className="input text-center font-mono tracking-[0.4em] py-6"
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
        <div className="flex justify-center gap-2.5">
          {[0,1,2,3,4,5].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-all duration-200"
              style={{
                background: i < code.length ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                transform: i < code.length ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {error && (
          <p className="text-[13px]" style={{ color: 'var(--color-danger)' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={code.length !== 6 || isJoining}
          className="btn-primary w-full py-3.5 text-[15px]"
        >
          {isJoining ? 'Ansluter...' : 'Anslut'}
        </button>
      </form>
    </div>
  );
}
