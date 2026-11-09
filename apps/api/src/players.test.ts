import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { csrfHeaders, loginAsAdmin, resetDb, testApp, testPrisma } from './test/helpers.js';
import { parsePlayerList } from './test/json.js';

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

describe('players', () => {
  it('lists and shows profiles to guests', async () => {
    await prisma.player.create({
      data: { displayName: 'Alice', normalizedName: 'alice', active: true },
    });
    const list = await app.inject({ method: 'GET', url: '/api/players' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ players: [{ displayName: 'Alice' }] });

    const players = parsePlayerList(list.json()).players;
    const first = players[0];
    if (first === undefined) throw new Error('expected a player');
    const profile = await app.inject({ method: 'GET', url: `/api/players/${first.id}` });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      displayName: 'Alice',
      winRate: null,
      status: 'provisional',
      rank: null,
    });
  });

  it('requires admin to create and rejects duplicates', async () => {
    const unauth = await app.inject({
      method: 'POST',
      url: '/api/players',
      headers: { ...csrfHeaders },
      payload: { displayName: 'Bob' },
    });
    expect(unauth.statusCode).toBe(401);

    const { cookie } = await loginAsAdmin(app, prisma);
    const create = await app.inject({
      method: 'POST',
      url: '/api/players',
      headers: { cookie, ...csrfHeaders },
      payload: { displayName: 'Bob' },
    });
    expect(create.statusCode).toBe(200);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/players',
      headers: { cookie, ...csrfHeaders },
      payload: { displayName: 'bob' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: 'PLAYER_DUPLICATE' } });
  });

  it('lets admin list inactive players', async () => {
    await prisma.player.create({
      data: { displayName: 'Inactive', normalizedName: 'inactive', active: false },
    });
    const guest = await app.inject({ method: 'GET', url: '/api/players' });
    expect(parsePlayerList(guest.json()).players).toHaveLength(0);

    const { cookie } = await loginAsAdmin(app, prisma);
    const admin = await app.inject({ method: 'GET', url: '/api/players', headers: { cookie } });
    expect(parsePlayerList(admin.json()).players).toHaveLength(1);
  });
});
