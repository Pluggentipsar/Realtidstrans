import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Realtidstrans – AI-stöd för samtal',
  description:
    'Realtidstranskribering med AI-sammanfattningar, fördjupande frågor och publikinteraktion.',
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
  themeColor: '#3B82F6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body className="font-sans bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="text-xl font-bold text-white">
                Realtids<span className="text-blue-400">trans</span>
              </Link>
              <div className="flex gap-4">
                <Link
                  href="/session/new"
                  className="text-sm text-gray-300 hover:text-white transition"
                >
                  Ny session
                </Link>
                <Link
                  href="/join"
                  className="text-sm text-gray-300 hover:text-white transition"
                >
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
