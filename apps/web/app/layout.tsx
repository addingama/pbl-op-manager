import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { MobileNav } from '@/components/mobile-nav';
import { PwaShell } from '@/components/pwa-shell';
import { getAdminSession } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'PBL Open Play',
  description: 'Padel open play manager',
  appleWebApp: {
    capable: true,
    title: 'PBL Open Play',
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const admin = await getAdminSession();

  return (
    <html lang="en">
      <body>
        <PwaShell />
        <MobileNav admin={admin} />
        <main id="main-content" className="mx-auto max-w-lg px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
