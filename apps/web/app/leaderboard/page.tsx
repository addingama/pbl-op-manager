import type { LeaderboardQuery } from '@pbl/shared';
import { Suspense } from 'react';
import { LeaderboardTabs } from '@/components/leaderboard-tabs';
import { fetchLeaderboard } from '@/lib/leaderboard';
import { messages } from '@/messages';

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: LeaderboardQuery['tab'] =
    params.tab === 'provisional' || params.tab === 'ranked' ? params.tab : 'ranked';
  const data = await fetchLeaderboard({ tab, limit: 50, offset: 0 });
  const body =
    data === null ? { tab, entries: [], total: 0, limit: 50, offset: 0 } : data;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.leaderboard.title}</h1>
      <p className="text-sm text-slate-600">{messages.leaderboard.intro}</p>
      <Suspense>
        <LeaderboardTabs tab={body.tab} entries={body.entries} total={body.total} />
      </Suspense>
    </div>
  );
}
