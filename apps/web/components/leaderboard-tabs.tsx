'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { LeaderboardEntry } from '@pbl/shared';
import { cn } from '@pbl/ui';
import { messages } from '@/messages';

type Tab = 'ranked' | 'provisional';

export function LeaderboardTabs({
  tab,
  entries,
  total,
}: {
  tab: Tab;
  entries: LeaderboardEntry[];
  total: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={messages.leaderboard.tabsAria}
        className="grid grid-cols-2 gap-2"
      >
        {(['ranked', 'provisional'] as const).map((key) => {
          const active = tab === key;
          return (
            <Link
              key={key}
              href={hrefFor(key)}
              role="tab"
              aria-selected={active}
              className={cn(
                'min-h-11 rounded-lg px-3 py-2 text-center text-sm font-medium',
                active
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200',
              )}
            >
              {messages.leaderboard[key]}
            </Link>
          );
        })}
      </div>
      <p className="text-sm text-slate-600">
        {messages.leaderboard.showing} {String(entries.length)} / {String(total)}
      </p>
      {entries.length === 0 ? (
        <p className="text-center text-sm text-slate-600" data-testid="leaderboard-empty">
          {messages.leaderboard.empty}
        </p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="leaderboard-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/players/${entry.id}`}
                data-testid="leaderboard-entry"
                className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:border-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <span className="w-8 shrink-0 font-semibold text-emerald-800">
                  {entry.rank ?? '—'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{entry.displayName}</span>
                <span className="shrink-0 tabular-nums text-slate-700">{entry.rating}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
