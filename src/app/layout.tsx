import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Realtidstrans',
  description: 'AI-drivet stod for intervjuer, panelsamtal och forelasningar.',
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
  themeColor: '#6366f1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body>
        {/* Navbar */}
        <nav className="sticky top-0 z-50" style={{ background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14">
              <Link href="/" className="text-lg font-bold text-white tracking-tight">
                Realtids<span style={{ color: 'var(--color-accent)' }}>trans</span>
              </Link>
              <div className="flex items-center gap-1">
                <Link href="/sessions" className="btn-ghost text-sm">
                  Sessioner
                </Link>
                <Link href="/session/new" className="btn-ghost text-sm">
                  Ny session
                </Link>
                <Link href="/join" className="btn-ghost text-sm">
                  Ga med
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
