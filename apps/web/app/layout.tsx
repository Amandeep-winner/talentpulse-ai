import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/layout/app-shell';

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
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
