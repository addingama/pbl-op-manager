import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@pbl/ui';
import { MonthlyActivityList } from '@/components/monthly-activity-list';
import { RatingHistoryChart } from '@/components/rating-history-chart';
import {
  fetchMonthlyActivity,
  fetchPlayerProfile,
  fetchRatingHistory,
} from '@/lib/player-profile';
import { messages } from '@/messages';

function formatPct(winRate: number | null): string {
  if (winRate === null) return '—';
  return `${String(Math.round(winRate * 100))}%`;
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, history, activity] = await Promise.all([
    fetchPlayerProfile(id),
    fetchRatingHistory(id),
    fetchMonthlyActivity(id),
  ]);

  if (profile === null) {
    return (
      <div className="flex flex-col gap-4">
        <p>{messages.profile.notFound}</p>
        <Link href="/leaderboard" className="text-emerald-800 underline">
          {messages.profile.backToLeaderboard}
        </Link>
      </div>
    );
  }

  const ratings = (history?.points ?? []).map((p) => Number(p.ratingAfter));

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/leaderboard"
        className="text-sm text-emerald-800 underline-offset-2 hover:underline"
      >
        {messages.profile.backToLeaderboard}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="player-name">
        {profile.displayName}
      </h1>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-600">{messages.profile.rating}</dt>
          <dd className="text-lg font-semibold tabular-nums">{profile.rating}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{messages.profile.rank}</dt>
          <dd className="text-lg font-semibold">{profile.rank ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{messages.profile.status}</dt>
          <dd>{messages.profile[profile.status]}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{messages.profile.winRate}</dt>
          <dd>{formatPct(profile.winRate)}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{messages.profile.record}</dt>
          <dd>
            {profile.wins}–{profile.losses}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">{messages.profile.matches}</dt>
          <dd>{profile.matchesPlayed}</dd>
        </div>
      </dl>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{messages.profile.ratingHistory}</CardTitle>
        </CardHeader>
        <CardContent>
          <RatingHistoryChart ratings={ratings} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{messages.profile.monthlyActivity}</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyActivityList rows={activity?.months ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
