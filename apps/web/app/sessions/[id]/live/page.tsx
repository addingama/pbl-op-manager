import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LiveRoundManager } from '@/components/live-round-manager';
import { getAdminSession } from '@/lib/auth';
import { buildPlayerNameMap } from '@/lib/session-detail';
import { getSessionDetail, listSessionRounds } from '@/lib/sessions-detail-server';
import { messages } from '@/messages';

export default async function SessionLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const focusRoundNumber =
    query.round !== undefined && query.round !== '' ? Number.parseInt(query.round, 10) : null;
  const [session, rounds, admin] = await Promise.all([
    getSessionDetail(id),
    listSessionRounds(id),
    getAdminSession(),
  ]);
  if (session === null) notFound();

  const nameMap = buildPlayerNameMap(session.participants);
  const playerNames = Object.fromEntries(nameMap.entries());

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <Link href={`/sessions/${id}`} className="text-sm font-medium text-emerald-800 underline">
          {messages.live.backToSession}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
        <p className="text-sm text-slate-600">{messages.live.title}</p>
      </div>
      <LiveRoundManager
        sessionId={session.id}
        isAdmin={admin !== null}
        initialRounds={rounds}
        playerNames={playerNames}
        focusRoundNumber={Number.isNaN(focusRoundNumber ?? NaN) ? null : focusRoundNumber}
      />
    </div>
  );
}
