import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  adminListResponseSchema,
  adminUserSchema,
  appSettingsResponseSchema,
} from '@pbl/shared';

const createAdminResponseSchema = z.object({ admin: adminUserSchema });
import { adminSessionCookie, csrfHeaders, resetDb, testApp, testPrisma } from './test/helpers.js';

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

describe('settings', () => {
  it('returns defaults when unset', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    const body = appSettingsResponseSchema.parse(res.json());
    expect(body.defaults.defaultCourtCount).toBe(2);
    expect(body.defaults.rankedThreshold).toBe(10);
  });

  it('updates defaults for admin', async () => {
    const { cookie } = await adminSessionCookie(prisma);
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie, ...csrfHeaders },
      payload: { defaultMode: 'RANDOM', defaultCourtCount: 4 },
    });
    expect(patch.statusCode).toBe(200);
    const body = appSettingsResponseSchema.parse(patch.json());
    expect(body.defaults.defaultMode).toBe('RANDOM');
    expect(body.defaults.defaultCourtCount).toBe(4);
  });

  it('lists and creates admins', async () => {
    const { cookie } = await adminSessionCookie(prisma);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admins',
      headers: { cookie, ...csrfHeaders },
    });
    expect(list.statusCode).toBe(200);
    const listed = adminListResponseSchema.parse(list.json());
    expect(listed.admins.length).toBe(1);

    const created = await app.inject({
      method: 'POST',
      url: '/api/admins',
      headers: { cookie, ...csrfHeaders },
      payload: {
        email: 'second@test.local',
        password: 'second-pass-123',
        displayName: 'Second Admin',
      },
    });
    expect(created.statusCode).toBe(200);
    const { admin } = createAdminResponseSchema.parse(created.json());
    expect(admin.email).toBe('second@test.local');
  });

  it('changes password', async () => {
    const email = 'pw@test.local';
    const { cookie } = await adminSessionCookie(prisma, {
      email,
      password: 'old-pass-123',
    });
    const change = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie, ...csrfHeaders },
      payload: { currentPassword: 'old-pass-123', newPassword: 'new-pass-12345' },
    });
    expect(change.statusCode).toBe(200);

    const loginOld = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'old-pass-123' },
    });
    expect(loginOld.statusCode).toBe(401);

    const loginNew = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'new-pass-12345' },
    });
    expect(loginNew.statusCode).toBe(200);
  });
});
