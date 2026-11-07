import { createPrismaClient, testDatabaseUrl, truncateAllTables } from '@pbl/database';
import type { PrismaClient } from '@pbl/database';
import { hash } from 'argon2';
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE_NAME, CSRF_HEADER, CSRF_HEADER_VALUE } from '@pbl/shared';
import { buildServer } from '../server.js';

export function testPrisma(): PrismaClient {
  return createPrismaClient({ url: testDatabaseUrl() });
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await truncateAllTables(prisma);
}

export async function createTestAdmin(
  prisma: PrismaClient,
  input: { email?: string; password?: string; displayName?: string } = {},
): Promise<{ email: string; password: string; userId: string }> {
  const email = input.email ?? 'admin@test.local';
  const password = input.password ?? 'test-password-123';
  const displayName = input.displayName ?? 'Test Admin';
  const passwordHash = await hash(password, { type: 2 });
  const user = await prisma.user.create({
    data: { email, displayName, passwordHash, active: true },
  });
  return { email, password, userId: user.id };
}

export async function testApp(prisma: PrismaClient): Promise<FastifyInstance> {
  return buildServer({ prisma, logger: false });
}

export const csrfHeaders = { [CSRF_HEADER]: CSRF_HEADER_VALUE } as const;

export function sessionCookie(setCookie: string | string[] | undefined): string {
  const line = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (line === undefined) throw new Error('no Set-Cookie header');
  const match = /pbl_session=([^;]+)/.exec(line);
  if (match?.[1] === undefined) throw new Error('no session cookie');
  return `${SESSION_COOKIE_NAME}=${match[1]}`;
}
