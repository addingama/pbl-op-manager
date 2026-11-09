import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { MobileNav } from '@/components/mobile-nav';
import { getAdminSession } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'PBL Open Play',
  description: 'Padel open play manager',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const admin = await getAdminSession();

  return (
    <html lang="en">
      <body>
        <MobileNav admin={admin} />
        <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
