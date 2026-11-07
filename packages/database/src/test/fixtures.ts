import { createPrismaClient } from '../client.js';
import { testDatabaseUrl } from '../env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { matchOrderKey } from '../order-key.js';

export function createTestClient(): PrismaClient {
  return createPrismaClient({ url: testDatabaseUrl() });
}

export async function createAdmin(prisma: PrismaClient): Promise<{ id: string }> {
  return prisma.user.create({
    data: { email: 'admin@test.local', displayName: 'Admin', passwordHash: 'x' },
  });
}

export async function createPlayers(prisma: PrismaClient, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const name = `Player ${String(i).padStart(2, '0')}`;
    const player = await prisma.player.create({
      data: { displayName: name, normalizedName: name.toLowerCase() },
    });
    ids.push(player.id);
  }
  return ids;
}

export async function createSession(
  prisma: PrismaClient,
  createdById: string,
): Promise<{ id: string; startsAt: Date }> {
  return prisma.openPlay.create({
    data: {
      title: 'Test Open Play',
      startsAt: new Date('2026-11-07T12:00:00.000Z'),
      courtCount: 2,
      createdById,
    },
  });
}

export interface RoundFixture {
  readonly roundId: string;
  readonly matchIds: readonly [string, string];
  /** Players in court order: court 1 team 1 (pos 1, 2), team 2 (pos 1, 2), then court 2. */
  readonly playing: readonly string[];
  readonly resting: readonly string[];
}

/** One round, two courts, eight players playing and the rest resting. */
export async function createRound(
  prisma: PrismaClient,
  session: { id: string; startsAt: Date },
  createdById: string,
  playerIds: readonly string[],
  number = 1,
): Promise<RoundFixture> {
  const round = await prisma.round.create({
    data: {
      openPlayId: session.id,
      number,
      mode: 'MANUAL',
      settings: {},
      ratingSnapshot: {},
      createdById,
    },
  });
  const playing = playerIds.slice(0, 8);
  const resting = playerIds.slice(8);
  const matchIds: string[] = [];
  for (const court of [1, 2]) {
    const match = await prisma.match.create({
      data: {
        roundId: round.id,
        courtNumber: court,
        orderKey: matchOrderKey(session.startsAt, session.id, number, court),
      },
    });
    matchIds.push(match.id);
    const players = playing.slice((court - 1) * 4, court * 4);
    await prisma.roundAssignment.createMany({
      data: players.map((playerId, i) => ({
        roundId: round.id,
        playerId,
        status: 'PLAYING' as const,
        matchId: match.id,
        team: i < 2 ? 1 : 2,
        position: (i % 2) + 1,
      })),
    });
  }
  await prisma.roundAssignment.createMany({
    data: resting.map((playerId) => ({ roundId: round.id, playerId, status: 'RESTING' as const })),
  });
  const [first, second] = matchIds;
  if (first === undefined || second === undefined) throw new Error('expected two matches');
  return { roundId: round.id, matchIds: [first, second], playing, resting };
}
