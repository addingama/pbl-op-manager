import type { PrismaClient } from '@pbl/database';
import type { TransactionClient } from '../../lib/transaction-client.js';

type Client = PrismaClient | TransactionClient;
import { ratingNumber } from '../../lib/ranked.js';

const SCHEDULABLE = ['REGISTERED', 'ACTIVE'] as const;

export async function loadEligibleParticipants(prisma: Client, openPlayId: string) {
  const rows = await prisma.openPlayParticipant.findMany({
    where: { openPlayId, status: { in: [...SCHEDULABLE] } },
    include: { player: true },
    orderBy: { playerId: 'asc' },
  });
  return rows.map((row) => ({
    id: row.playerId,
    rating: Number(ratingNumber(row.player.rating)),
    displayName: row.player.displayName,
  }));
}

export async function loadFixedTeams(prisma: Client, openPlayId: string) {
  const teams = await prisma.fixedTeam.findMany({ where: { openPlayId } });
  return teams.map((t) => [t.playerAId, t.playerBId] as const);
}
