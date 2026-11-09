import type { PrismaClient } from '@pbl/database';
import type { TransactionClient } from '../../lib/transaction-client.js';

type Client = PrismaClient | TransactionClient;

export function listRoundsForSession(prisma: Client, openPlayId: string) {
  return prisma.round.findMany({
    where: { openPlayId },
    orderBy: { number: 'asc' },
    include: {
      openPlay: true,
      matches: {
        orderBy: { courtNumber: 'asc' },
        include: {
          assignments: { orderBy: [{ team: 'asc' }, { position: 'asc' }] },
        },
      },
      assignments: true,
    },
  });
}

export function findRound(prisma: Client, id: string) {
  return prisma.round.findUnique({
    where: { id },
    include: {
      openPlay: true,
      matches: {
        orderBy: { courtNumber: 'asc' },
        include: {
          assignments: { orderBy: [{ team: 'asc' }, { position: 'asc' }] },
        },
      },
      assignments: true,
    },
  });
}

export function lastRoundNumber(prisma: Client, openPlayId: string) {
  return prisma.round.aggregate({
    where: { openPlayId },
    _max: { number: true },
  });
}

export function findLastRound(prisma: Client, openPlayId: string) {
  return prisma.round.findFirst({
    where: { openPlayId },
    orderBy: { number: 'desc' },
    include: { matches: true },
  });
}

export async function lockOpenPlay(tx: TransactionClient, openPlayId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "OpenPlay" WHERE id = ${openPlayId} FOR UPDATE`;
}
