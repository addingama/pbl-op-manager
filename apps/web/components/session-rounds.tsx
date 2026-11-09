import type { roundDetailSchema } from '@pbl/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@pbl/ui';
import type { z } from 'zod';
import { buildPlayerNameMap, formatPlayerPair } from '@/lib/session-detail';
import type { Participant } from '@/lib/session-detail';
import { messages } from '@/messages';

type RoundDetail = z.infer<typeof roundDetailSchema>;

const matchStatusKeys = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

function matchStatusLabel(status: string): string {
  if ((matchStatusKeys as readonly string[]).includes(status)) {
    return messages.matchStatus[status as (typeof matchStatusKeys)[number]];
  }
  return status;
}

export function SessionRounds({
  rounds,
  participants,
}: {
  readonly rounds: RoundDetail[];
  readonly participants: readonly Participant[];
}) {
  const names = buildPlayerNameMap(participants);

  if (rounds.length === 0) {
    return <p className="text-sm text-slate-600">{messages.sessionDetail.noRounds}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {rounds.map((round) => (
        <li key={round.id}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Round {round.number} · {round.mode}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {round.matches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                  data-testid={`match-${match.id}`}
                >
                  <p className="font-medium text-slate-800">
                    {messages.sessionDetail.court} {match.courtNumber} ·{' '}
                    {matchStatusLabel(match.status)}
                  </p>
                  <p className="text-slate-700">{formatPlayerPair(match.team1, names)}</p>
                  <p className="text-slate-500">vs</p>
                  <p className="text-slate-700">{formatPlayerPair(match.team2, names)}</p>
                  {match.winnerTeam === 1 || match.winnerTeam === 2 ? (
                    <p className="mt-1 text-xs text-emerald-800">Winner: team {match.winnerTeam}</p>
                  ) : null}
                </div>
              ))}
              {round.resting.length > 0 ? (
                <p className="text-xs text-slate-600">
                  {messages.sessionDetail.resting}:{' '}
                  {round.resting.map((id) => names.get(id) ?? id).join(', ')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
