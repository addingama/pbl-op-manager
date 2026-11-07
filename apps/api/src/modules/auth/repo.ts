import type { PrismaClient } from '@pbl/database';

export function findUserByEmail(prisma: PrismaClient, email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(prisma: PrismaClient, id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export function createSession(
  prisma: PrismaClient,
  input: { userId: string; tokenHash: string; expiresAt: Date },
) {
  return prisma.authSession.create({ data: input });
}

export function findSessionByTokenHash(prisma: PrismaClient, tokenHash: string) {
  return prisma.authSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
}

export function deleteSession(prisma: PrismaClient, id: string) {
  return prisma.authSession.delete({ where: { id } });
}

export function touchSession(prisma: PrismaClient, id: string, expiresAt: Date) {
  return prisma.authSession.update({ where: { id }, data: { expiresAt } });
}

export function createUser(
  prisma: PrismaClient,
  input: { email: string; displayName: string; passwordHash: string },
) {
  return prisma.user.create({ data: { ...input, active: true } });
}
