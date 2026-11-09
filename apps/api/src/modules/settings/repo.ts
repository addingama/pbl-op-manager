import type { PrismaClient } from '@pbl/database';
import { SETTINGS_KEY } from './defaults.js';

export function getSetting(prisma: PrismaClient, key: string) {
  return prisma.appSetting.findUnique({ where: { key } });
}

export function upsertSetting(prisma: PrismaClient, key: string, value: unknown) {
  return prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}

export function listAdmins(prisma: PrismaClient) {
  return prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      active: true,
      lastLoginAt: true,
    },
  });
}

export { SETTINGS_KEY };
