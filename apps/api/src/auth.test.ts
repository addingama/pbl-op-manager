import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SESSION_COOKIE_NAME } from '@pbl/shared';
import { hashSessionToken } from './lib/session.js';
import {
  createTestAdmin,
  csrfHeaders,
  resetDb,
  sessionCookie,
  testApp,
  testPrisma,
} from './test/helpers.js';

const prisma = testPrisma();
let app: Awaited<ReturnType<typeof testApp>>;

beforeAll(async () => {
  app = await testApp(prisma);
});

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await app.close();
});

describe('guest reads', () => {
  it('GET /api/health works without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', database: 'ok' });
    expect(res.headers['x-request-id']).toBeTypeOf('string');
  });
});

describe('auth flow', () => {
  it('logs in, returns me, and logs out', async () => {
    const admin = await createTestAdmin(prisma);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: admin.email, password: admin.password },
    });
    expect(login.statusCode).toBe(200);
    const cookie = sessionCookie(login.headers['set-cookie']);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: admin.email, displayName: 'Test Admin' });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, ...csrfHeaders },
    });
    expect(logout.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
    expect(after.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects a bad password', async () => {
    const admin = await createTestAdmin(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: admin.email, password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'auth.login.failure' } })).toBe(1);
  });

  it('rejects validation errors with field details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email', password: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    const validationErrorSchema = z.object({
      error: z.object({
        code: z.literal('VALIDATION_ERROR'),
        details: z.object({
          issues: z.array(z.object({ path: z.string(), message: z.string() })).min(1),
        }),
      }),
    });
    expect(validationErrorSchema.safeParse(res.json()).success).toBe(true);
  });

  it('rejects an expired session', async () => {
    const admin = await createTestAdmin(prisma);
    const token = 'expired-test-token';
    await prisma.authSession.create({
      data: {
        userId: admin.userId,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rate-limits repeated login attempts', async () => {
    const admin = await createTestAdmin(prisma);
    const limitedApp = await testApp(prisma);
    try {
      for (let i = 0; i < 6; i++) {
        const res = await limitedApp.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: admin.email, password: 'wrong' },
        });
        if (i < 5) expect(res.statusCode).toBe(401);
        else expect(res.statusCode).toBe(429);
      }
    } finally {
      await limitedApp.close();
    }
  });
});

describe('admin guards', () => {
  it('returns 401 for mutating routes without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...csrfHeaders },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when the CSRF header is missing', async () => {
    const admin = await createTestAdmin(prisma);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: admin.email, password: admin.password },
    });
    const cookie = sessionCookie(login.headers['set-cookie']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/mutate-check',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'CSRF_REQUIRED' } });
  });

  it('allows a protected mutation with session and CSRF', async () => {
    const admin = await createTestAdmin(prisma);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: admin.email, password: admin.password },
    });
    const cookie = sessionCookie(login.headers['set-cookie']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/mutate-check',
      headers: { cookie, ...csrfHeaders },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, actor: { kind: 'admin', userId: admin.userId } });
  });
});
