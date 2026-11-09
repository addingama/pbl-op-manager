import type { PrismaClient } from '@pbl/database';
import type { TransactionClient } from '../../lib/transaction-client.js';

type Client = PrismaClient | TransactionClient;
import type { PreviousRound } from '@pbl/match-generator';

export async function loadPreviousRounds(
  prisma: Client,
  openPlayId: string,
  beforeNumber?: number,
): Promise<PreviousRound[]> {
  const rounds = await prisma.round.findMany({
    where: {
      openPlayId,
      ...(beforeNumber !== undefined ? { number: { lt: beforeNumber } } : {}),
    },
    orderBy: { number: 'asc' },
    include: {
      matches: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          assignments: true,
        },
      },
    },
  });

  return rounds.map((round) => ({
    roundNumber: round.number,
    matches: round.matches.map((match) => {
      const byTeam = (team: number): [string, string] => {
        const slots = match.assignments
          .filter((a) => a.team === team)
          .sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
        const a = slots[0]?.playerId;
        const b = slots[1]?.playerId;
        if (a === undefined || b === undefined) throw new Error('incomplete match teams');
        return [a, b];
      };
      const winner = match.winnerTeam === 1 ? 1 : match.winnerTeam === 2 ? (2 as const) : null;
      return { team1: byTeam(1), team2: byTeam(2), winner };
    }),
  }));
}
