import type { PrismaClient } from '@pbl/database';

export function listPlayers(prisma: PrismaClient, activeOnly: boolean) {
  return prisma.player.findMany({
    ...(activeOnly ? { where: { active: true } } : {}),
    orderBy: [{ active: 'desc' }, { displayName: 'asc' }],
  });
}

export function findPlayer(prisma: PrismaClient, id: string) {
  return prisma.player.findUnique({ where: { id } });
}

export function findByNormalizedName(prisma: PrismaClient, normalizedName: string) {
  return prisma.player.findFirst({ where: { normalizedName } });
}

export function findSimilarNames(prisma: PrismaClient, normalizedName: string, excludeId?: string) {
  return prisma.player.findMany({
    where: {
      active: true,
      ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, displayName: true, normalizedName: true },
  });
}

export function createPlayer(
  prisma: PrismaClient,
  data: { displayName: string; normalizedName: string },
) {
  return prisma.player.create({ data: { ...data, active: true } });
}

export function updatePlayer(
  prisma: PrismaClient,
  id: string,
  data: { displayName?: string; normalizedName?: string; active?: boolean },
) {
  return prisma.player.update({ where: { id }, data });
}
