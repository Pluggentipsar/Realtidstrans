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
    <div className="max-w-md mx-auto px-4 py-20">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-3">Gå med i session</h1>
        <p className="text-gray-400">
          Ange den 6-siffriga sessionskoden för att ansluta som publik
        </p>
      </div>

      <form onSubmit={handleJoin} className="space-y-4">
        <input
          type="text"
          className="input text-center text-3xl font-mono tracking-[0.5em] py-6"
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(val);
            setError('');
          }}
          maxLength={6}
          inputMode="numeric"
          autoFocus
        />

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={code.length !== 6 || isJoining}
          className="btn-primary w-full text-center"
        >
          {isJoining ? 'Ansluter...' : 'Anslut'}
        </button>
      </form>
    </div>
  );
}
