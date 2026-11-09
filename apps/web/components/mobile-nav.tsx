'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminMe } from '@pbl/shared';
import { cn } from '@pbl/ui';
import { messages } from '@/messages';
import { LogoutButton } from './logout-button';

const links = [
  { href: '/', label: messages.nav.home },
  { href: '/sessions', label: messages.nav.sessions },
] as const;

export function MobileNav({ admin }: { admin: AdminMe | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-emerald-800">{messages.app.name}</p>
          {admin === null ? (
            <Link
              href="/login"
              className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
            >
              {messages.nav.adminSignIn}
            </Link>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="max-w-[9rem] truncate" title={admin.email}>
                {admin.displayName}
              </span>
              <LogoutButton />
            </div>
          )}
        </div>
        <nav aria-label="Main" className="flex gap-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'min-h-11 flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium',
                  active
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
