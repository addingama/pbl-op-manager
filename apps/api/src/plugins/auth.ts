import { AppError, ErrorCode, SESSION_COOKIE_NAME, type Actor } from '@pbl/shared';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@pbl/database';
import { resolveSession } from '../modules/auth/service.js';

export function registerAuthContext(app: FastifyInstance, prisma: PrismaClient): void {
  app.addHook('preHandler', async (request) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const session = await resolveSession(prisma, token);
    if (session !== null) {
      request.actor = { kind: 'admin', userId: session.userId };
    }
  });
}

export function requireAdmin(request: {
  actor: Actor;
}): asserts request is { actor: { kind: 'admin'; userId: string } } {
  if (request.actor.kind !== 'admin') {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Sign in required');
  }
}
