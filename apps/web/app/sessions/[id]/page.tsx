import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ParticipantManager } from '@/components/participant-manager';
import { SessionRounds } from '@/components/session-rounds';
import { getAdminSession } from '@/lib/auth';
import { partitionParticipants } from '@/lib/session-detail';
import {
  getSessionDetail,
  getSessionStandings,
  listSessionRounds,
} from '@/lib/sessions-detail-server';
import { formatSessionWhen } from '@/lib/sessions';
import { messages } from '@/messages';

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, rounds, standings, admin] = await Promise.all([
    getSessionDetail(id),
    listSessionRounds(id),
    getSessionStandings(id),
    getAdminSession(),
  ]);

  if (session === null) notFound();

  const { roster, waitlist, inactive } = partitionParticipants(session.participants);

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Link
          href="/sessions"
          className="text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
        >
          {messages.sessions.backToList}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
        <p className="text-sm text-slate-700">{formatSessionWhen(session.startsAt)}</p>
        {session.venue !== null ? <p className="text-sm text-slate-700">{session.venue}</p> : null}
        <p className="text-sm text-slate-600">
          {messages.status[session.status]} · {session.courtCount} {messages.sessions.courts}
        </p>
      </div>

      <section className="space-y-2" aria-labelledby="standings-heading">
        <h2 id="standings-heading" className="text-lg font-semibold">
          {messages.sessionDetail.standings}
        </h2>
        {standings.length === 0 ? (
          <p className="text-sm text-slate-600">No completed matches yet.</p>
        ) : (
          <ol className="space-y-1 text-sm" data-testid="session-standings">
            {standings.map((row, index) => (
              <li
                key={row.playerId}
                className="flex justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <span>
                  {index + 1}. {row.displayName}
                </span>
                <span className="text-slate-600">
                  {row.wins}W · {row.losses}L · {row.gamesPlayed}G
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="rounds-heading">
        <h2 id="rounds-heading" className="text-lg font-semibold">
          {messages.sessionDetail.rounds}
        </h2>
        <SessionRounds rounds={rounds} participants={session.participants} />
      </section>

      <section className="space-y-2" aria-labelledby="participants-heading">
        <h2 id="participants-heading" className="text-lg font-semibold">
          {messages.sessionDetail.participants}
        </h2>
        <ParticipantReadonlyList title="" rows={roster} />
        {waitlist.length > 0 ? (
          <ParticipantReadonlyList title={messages.sessionDetail.waitlist} rows={waitlist} />
        ) : null}
        {inactive.length > 0 ? (
          <ParticipantReadonlyList title={messages.sessionDetail.inactive} rows={inactive} />
        ) : null}
      </section>

      {admin !== null ? (
        <ParticipantManager
          sessionId={session.id}
          initialParticipants={session.participants.map((p) => ({ ...p }))}
        />
      ) : (
        <p className="text-sm text-slate-600">
          <Link
            href="/login"
            className="font-medium text-emerald-800 underline-offset-2 hover:underline"
          >
            {messages.nav.adminSignIn}
          </Link>{' '}
          to manage participants.
        </p>
      )}
    </div>
  );
}

function ParticipantReadonlyList({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: {
    id: string;
    displayName: string;
    status: keyof typeof messages.participantStatus;
    waitlistPos: number | null;
  }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      {title !== '' ? <h3 className="text-sm font-semibold text-slate-800">{title}</h3> : null}
      <ul className="space-y-1 text-sm">
        {rows.map((p) => (
          <li key={p.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span>{p.displayName}</span>
            <span className="text-slate-600">
              {messages.participantStatus[p.status]}
              {p.waitlistPos !== null ? ` #${String(p.waitlistPos)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
