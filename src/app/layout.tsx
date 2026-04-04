import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Realtidstrans',
  description: 'AI-drivet stöd för intervjuer, panelsamtal och föreläsningar.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Realtidstrans',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#d97706',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body>
        {/* Noise texture overlay for depth */}
        <div className="noise-overlay" />

        <nav className="sticky top-0 z-50" style={{ background: 'rgba(6,6,10,0.75)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex justify-between items-center h-14">
              <Link href="/" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }} className="text-base font-bold text-white">
                Realtids<span style={{ color: 'var(--color-accent)' }}>trans</span>
              </Link>
              <div className="flex items-center gap-0.5">
                <Link href="/sessions" className="px-3 py-1.5 text-[13px] rounded-lg transition-all duration-200 hover:bg-white/[0.04]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
                  Sessioner
                </Link>
                <Link href="/session/new" className="px-3 py-1.5 text-[13px] rounded-lg transition-all duration-200 hover:bg-white/[0.04]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
                  Ny session
                </Link>
                <Link href="/join" className="px-3 py-1.5 text-[13px] rounded-lg transition-all duration-200 hover:bg-white/[0.04]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
                  Gå med
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
