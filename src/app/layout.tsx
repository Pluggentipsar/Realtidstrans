import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Realtidstrans – AI-stöd för samtal',
  description:
    'Realtidstranskribering med AI-sammanfattningar, fördjupande frågor och publikinteraktion.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <a href="/" className="text-xl font-bold text-white">
                Realtids<span className="text-blue-400">trans</span>
              </a>
              <div className="flex gap-4">
                <a
                  href="/session/new"
                  className="text-sm text-gray-300 hover:text-white transition"
                >
                  Ny session
                </a>
                <a
                  href="/join"
                  className="text-sm text-gray-300 hover:text-white transition"
                >
                  Gå med
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
