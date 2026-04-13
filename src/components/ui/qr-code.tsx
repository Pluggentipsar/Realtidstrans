'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QROverlayProps {
  url: string;
  label?: string;
  size?: number;
  sessionCode?: string;
}

/**
 * QR code that can be clicked to show fullscreen overlay.
 * Used on landing page and in moderator view.
 */
export function QROverlay({ url, label, size = 140, sessionCode }: QROverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Small QR */}
      <button
        onClick={() => setIsExpanded(true)}
        className="flex flex-col items-center gap-2 group cursor-pointer transition-transform hover:scale-105"
      >
        <div className="p-3 rounded-xl" style={{ background: 'white' }}>
          <QRCodeSVG value={url} size={size} level="M" bgColor="white" fgColor="#1a1000" />
        </div>
        <p className="text-xs transition-colors group-hover:text-white" style={{ color: 'var(--color-text-muted)' }}>
          {label || 'Skanna QR-koden'} <span className="opacity-50">· tryck för att förstora</span>
        </p>
      </button>

      {/* Fullscreen overlay */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-[300] flex flex-col items-center justify-center animate-fade-in cursor-pointer"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
          onClick={() => setIsExpanded(false)}
        >
          <div className="p-8 rounded-3xl mb-6" style={{ background: 'white' }}>
            <QRCodeSVG value={url} size={320} level="H" bgColor="white" fgColor="#1a1000" />
          </div>

          {sessionCode && (
            <div className="text-center mb-4">
              <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Eller ange koden manuellt:</p>
              <div className="text-5xl font-mono font-bold tracking-[0.3em]" style={{ color: 'var(--color-accent)' }}>
                {sessionCode}
              </div>
            </div>
          )}

          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {label || 'Skanna för att gå med'}
          </p>

          <p className="text-xs mt-6" style={{ color: 'var(--color-text-muted)' }}>
            Tryck var som helst för att stänga
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Session-specific QR that includes the session code in the URL.
 * Used in moderator view — audience lands on /join?code=XXXXXX with code pre-filled.
 */
export function SessionQR({ sessionCode, baseUrl }: { sessionCode: string; baseUrl?: string }) {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const joinUrl = `${origin}/join?code=${sessionCode}`;

  return (
    <QROverlay
      url={joinUrl}
      sessionCode={sessionCode}
      label={`Gå med · kod: ${sessionCode}`}
      size={100}
    />
  );
}
