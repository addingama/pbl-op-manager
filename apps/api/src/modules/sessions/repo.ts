import type { ParticipantStatus, Prisma, PrismaClient } from '@pbl/database';

export function listSessions(prisma: PrismaClient, where: Prisma.OpenPlayWhereInput) {
  return prisma.openPlay.findMany({
    where,
    orderBy: { startsAt: 'desc' },
    include: { _count: { select: { participants: true } } },
  });
}

export function findCompletedMatchesInSession(prisma: PrismaClient, openPlayId: string) {
  return prisma.match.findMany({
    where: {
      round: { openPlayId },
      status: 'COMPLETED',
      winnerTeam: { not: null },
    },
    include: {
      assignments: { where: { status: 'PLAYING' } },
    },
  });
}

export function findSession(prisma: PrismaClient, id: string) {
  return prisma.openPlay.findUnique({
    where: { id },
    include: {
      participants: {
        include: { player: { select: { displayName: true } } },
        orderBy: [{ status: 'asc' }, { waitlistPos: 'asc' }, { joinedAt: 'asc' }],
      },
    },
  });
}

export function createSession(prisma: PrismaClient, data: Prisma.OpenPlayCreateInput) {
  return prisma.openPlay.create({ data });
}

export function updateSession(prisma: PrismaClient, id: string, data: Prisma.OpenPlayUpdateInput) {
  return prisma.openPlay.update({ where: { id }, data });
}

export function findParticipant(prisma: PrismaClient, openPlayId: string, playerId: string) {
  return prisma.openPlayParticipant.findUnique({
    where: { openPlayId_playerId: { openPlayId, playerId } },
    include: { player: { select: { displayName: true } } },
  });
}

export function upsertParticipant(
  prisma: PrismaClient,
  data: {
    openPlayId: string;
    playerId: string;
    status: ParticipantStatus;
    waitlistPos: number | null;
  },
) {
  return prisma.openPlayParticipant.upsert({
    where: { openPlayId_playerId: { openPlayId: data.openPlayId, playerId: data.playerId } },
    create: {
      openPlayId: data.openPlayId,
      playerId: data.playerId,
      status: data.status,
      source: 'ADMIN',
      ...(data.waitlistPos !== null ? { waitlistPos: data.waitlistPos } : {}),
    },
    update: {
      status: data.status,
      waitlistPos: data.waitlistPos,
      leftAt: null,
      source: 'ADMIN',
    },
    include: { player: { select: { displayName: true } } },
  });
}

export function updateParticipant(
  prisma: PrismaClient,
  id: string,
  data: Prisma.OpenPlayParticipantUpdateInput,
) {
  return prisma.openPlayParticipant.update({
    where: { id },
    data,
    include: { player: { select: { displayName: true } } },
  });
}
