import type { PrismaClient } from '@pbl/database';
import { AppError, ErrorCode, type LoginBody } from '@pbl/shared';
import { verify } from 'argon2';
import { writeAudit } from '../../lib/audit.js';
import { hashSessionToken, newSessionToken, sessionExpiresAt } from '../../lib/session.js';
import * as repo from './repo.js';

export interface LoginSuccess {
  readonly token: string;
  readonly user: { readonly id: string; readonly email: string; readonly displayName: string };
}

export async function login(
  prisma: PrismaClient,
  body: LoginBody,
  audit: { requestId: string },
): Promise<LoginSuccess> {
  const user = await repo.findUserByEmail(prisma, body.email);
  if (user === null || !user.active) {
    await writeAudit(prisma, {
      actorUserId: null,
      action: 'auth.login.failure',
      entityType: 'User',
      entityId: body.email,
      requestId: audit.requestId,
      reason: 'invalid_credentials',
    });
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Invalid email or password');
  }

  const ok = await verify(user.passwordHash, body.password);
  if (!ok) {
    await writeAudit(prisma, {
      actorUserId: user.id,
      action: 'auth.login.failure',
      entityType: 'User',
      entityId: user.id,
      requestId: audit.requestId,
      reason: 'invalid_credentials',
    });
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Invalid email or password');
  }

  const token = newSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = sessionExpiresAt();
  await repo.createSession(prisma, { userId: user.id, tokenHash, expiresAt });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit(prisma, {
    actorUserId: user.id,
    action: 'auth.login.success',
    entityType: 'User',
    entityId: user.id,
    requestId: audit.requestId,
  });

  return { token, user: { id: user.id, email: user.email, displayName: user.displayName } };
}

export async function logout(
  prisma: PrismaClient,
  tokenHash: string,
  requestId: string,
): Promise<void> {
  const session = await repo.findSessionByTokenHash(prisma, tokenHash);
  if (session === null) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  }
  await repo.deleteSession(prisma, session.id);
  await writeAudit(prisma, {
    actorUserId: session.userId,
    action: 'auth.logout',
    entityType: 'AuthSession',
    entityId: session.id,
    requestId,
  });
}

export async function resolveSession(prisma: PrismaClient, token: string | undefined) {
  if (token === undefined || token === '') return null;
  const session = await repo.findSessionByTokenHash(prisma, hashSessionToken(token));
  if (session === null) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await repo.deleteSession(prisma, session.id);
    return null;
  }
  if (!session.user.active) return null;

  const expiresAt = sessionExpiresAt();
  await repo.touchSession(prisma, session.id, expiresAt);
  return { userId: session.userId, user: session.user, sessionId: session.id };
}

export async function getMe(prisma: PrismaClient, userId: string) {
  const user = await repo.findUserById(prisma, userId);
  if (user === null || !user.active) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  }
  return { id: user.id, email: user.email, displayName: user.displayName };
}
