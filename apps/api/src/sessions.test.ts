import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { csrfHeaders, loginAsAdmin, resetDb, testApp, testPrisma } from './test/helpers.js';
import { parseId, parseParticipants, parseSessionList } from './test/json.js';

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

async function makePlayers(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = await prisma.player.create({
      data: {
        displayName: `P${String(i + 1).padStart(2, '0')}`,
        normalizedName: `p${String(i + 1).padStart(2, '0')}`,
      },
    });
    ids.push(p.id);
  }
  return ids;
}

function at(ids: readonly string[], index: number): string {
  const id = ids[index];
  if (id === undefined) throw new Error(`missing player at ${String(index)}`);
  return id;
}

describe('sessions authz and visibility', () => {
  it('hides private sessions from guests', async () => {
    const { cookie } = await loginAsAdmin(app, prisma);
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie, ...csrfHeaders },
      payload: {
        title: 'Secret',
        startsAt: '2026-12-01T12:00:00.000Z',
        courtCount: 2,
        visibility: 'PRIVATE',
      },
    });
    const sessionId = parseId(created.json());

    const guestList = await app.inject({ method: 'GET', url: '/api/sessions' });
    expect(parseSessionList(guestList.json()).sessions).toHaveLength(0);

    const guestGet = await app.inject({ method: 'GET', url: `/api/sessions/${sessionId}` });
    expect(guestGet.statusCode).toBe(404);

    const adminGet = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie },
    });
    expect(adminGet.statusCode).toBe(200);
  });

  it('returns 401 for mutating session routes without admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { ...csrfHeaders },
      payload: { title: 'X', startsAt: '2026-12-01T12:00:00.000Z', courtCount: 1 },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('waiting list and capacity', () => {
  it('puts overflow on the waitlist in FIFO order and promotes', async () => {
    const { cookie } = await loginAsAdmin(app, prisma);
    const players = await makePlayers(3);
    const session = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie, ...csrfHeaders },
      payload: {
        title: 'Open Play',
        startsAt: '2026-12-01T12:00:00.000Z',
        courtCount: 2,
        capacity: 2,
        visibility: 'PUBLIC',
      },
    });
    const sessionId = parseId(session.json());
    await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie, ...csrfHeaders },
      payload: { status: 'OPEN' },
    });

    const add = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/participants`,
      headers: { cookie, ...csrfHeaders },
      payload: { playerIds: players },
    });
    expect(add.statusCode).toBe(200);
    const parts = parseParticipants(add.json()).participants;
    expect(parts.filter((p) => p.status === 'REGISTERED')).toHaveLength(2);
    const waitlisted = parts.filter((p) => p.status === 'WAITLISTED');
    expect(waitlisted).toHaveLength(1);
    expect(waitlisted[0]?.waitlistPos).toBe(1);

    const promote = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/participants/${at(players, 2)}/promote`,
      headers: { cookie, ...csrfHeaders },
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json()).toMatchObject({
      participant: { status: 'REGISTERED', waitlistPos: null },
    });
  });
});

describe('lifecycle and participant changes', () => {
  it('walks DRAFT → OPEN → LIVE and supports late join and leave', async () => {
    const { cookie } = await loginAsAdmin(app, prisma);
    const players = await makePlayers(2);
    const p1 = at(players, 0);
    const p2 = at(players, 1);
    const session = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie, ...csrfHeaders },
      payload: {
        title: 'Lifecycle',
        startsAt: '2026-12-01T12:00:00.000Z',
        courtCount: 2,
      },
    });
    const sessionId = parseId(session.json());

    for (const status of ['OPEN', 'LIVE'] as const) {
      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/sessions/${sessionId}`,
        headers: { cookie, ...csrfHeaders },
        payload: { status },
      });
      expect(patch.statusCode).toBe(200);
    }

    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}`,
      headers: { cookie, ...csrfHeaders },
      payload: { status: 'DRAFT' },
    });
    expect(bad.statusCode).toBe(409);

    await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/participants`,
      headers: { cookie, ...csrfHeaders },
      payload: { playerIds: [p1] },
    });

    const late = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/participants`,
      headers: { cookie, ...csrfHeaders },
      payload: { playerIds: [p2] },
    });
    expect(late.json()).toMatchObject({ participants: [{ status: 'ACTIVE' }] });

    const leave = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}/participants/${p1}`,
      headers: { cookie, ...csrfHeaders },
      payload: { status: 'LEFT' },
    });
    expect(leave.statusCode).toBe(200);
    expect(leave.json()).toMatchObject({ participant: { status: 'LEFT' } });

    const unavailable = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}/participants/${p2}`,
      headers: { cookie, ...csrfHeaders },
      payload: { status: 'UNAVAILABLE' },
    });
    expect(unavailable.json()).toMatchObject({ participant: { status: 'UNAVAILABLE' } });
  });
});

describe('session read aggregates', () => {
  it('exposes rounds and standings to guests on public sessions', async () => {
    const { cookie } = await loginAsAdmin(app, prisma);
    const session = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie, ...csrfHeaders },
      payload: {
        title: 'Public read',
        startsAt: '2026-12-01T12:00:00.000Z',
        courtCount: 2,
        visibility: 'PUBLIC',
      },
    });
    const sessionId = parseId(session.json());

    const guestRounds = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/rounds`,
    });
    expect(guestRounds.statusCode).toBe(200);
    expect(guestRounds.json()).toEqual({ rounds: [] });

    const guestStandings = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/standings`,
    });
    expect(guestStandings.statusCode).toBe(200);
    expect(guestStandings.json()).toEqual({ standings: [] });

    const guestPrivate = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/rounds`,
      headers: { cookie },
    });
    expect(guestPrivate.statusCode).toBe(200);
  });
});
