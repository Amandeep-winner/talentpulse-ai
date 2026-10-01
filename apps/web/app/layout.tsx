import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export const metadata: Metadata = {
  title: 'TalentPulse AI - Agentic Recruitment Intelligence & Optimization',
  description: 'AI-powered recruitment intelligence, candidate matching, and budget optimization platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0B0F19] text-gray-100 antialiased">
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <Topbar />
              <main className="flex-1 overflow-y-auto p-6 bg-[#0B0F19]">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
