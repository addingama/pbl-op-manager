import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@pbl/database';
import {
  adminMeSchema,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  loginBodySchema,
  parseBody,
  SESSION_COOKIE_NAME,
} from '@pbl/shared';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../plugins/auth.js';
import { hashSessionToken } from '../../lib/session.js';
import { requestIdOf } from '../../lib/request.js';
import * as authService from './service.js';

const isProduction = process.env['NODE_ENV'] === 'production';

export async function registerAuthRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
): Promise<void> {
  await app.register(
    async (loginApp) => {
      await loginApp.register(rateLimit, {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request) => {
          const ip = request.ip;
          const body = request.body as { email?: string } | undefined;
          const email = typeof body?.email === 'string' ? body.email.toLowerCase() : '';
          return `${ip}:${email}`;
        },
      });
      loginApp.post('/login', async (request, reply) => {
        const body = parseBody(loginBodySchema, request.body);
        const result = await authService.login(prisma, body, { requestId: requestIdOf(request) });
        reply.setCookie(SESSION_COOKIE_NAME, result.token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: isProduction,
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        return { user: result.user };
      });
    },
    { prefix: '/auth' },
  );

  app.post('/auth/logout', async (request, reply) => {
    requireAdmin(request);
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token !== undefined) {
      await authService.logout(prisma, hashSessionToken(token), requestIdOf(request));
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (request) => {
    requireAdmin(request);
    const me = await authService.getMe(prisma, request.actor.userId);
    return adminMeSchema.parse(me);
  });
}

export const csrfHeaders = { [CSRF_HEADER]: CSRF_HEADER_VALUE } as const;
