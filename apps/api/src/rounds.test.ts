import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IDEMPOTENCY_HEADER } from '@pbl/shared';
import { parseId } from './test/json.js';
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

async function adminCookie(): Promise<string> {
  const { cookie } = await adminSessionCookie(prisma);
  return cookie;
}

async function liveSession(cookie: string, playerCount = 8) {
  const ids: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const p = await prisma.player.create({
      data: {
        displayName: `P${String(i + 1).padStart(2, '0')}`,
        normalizedName: `p${String(i + 1).padStart(2, '0')}`,
      },
    });
    ids.push(p.id);
  }
  const created = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: { cookie, ...csrfHeaders },
    payload: {
      title: 'Live',
      startsAt: '2026-12-01T12:00:00.000Z',
      courtCount: 2,
    },
  });
  const sessionId = parseId(created.json());
  await app.inject({
    method: 'PATCH',
    url: `/api/sessions/${sessionId}`,
    headers: { cookie, ...csrfHeaders },
    payload: { status: 'OPEN' },
  });
  await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionId}/participants`,
    headers: { cookie, ...csrfHeaders },
    payload: { playerIds: ids },
  });
  await app.inject({
    method: 'PATCH',
    url: `/api/sessions/${sessionId}`,
    headers: { cookie, ...csrfHeaders },
    payload: { status: 'LIVE' },
  });
  return { sessionId, playerIds: ids };
}

function roundFrom(body: unknown): {
  round: { id: string; version: number; matches: { team1: string[]; team2: string[] }[] };
} {
  return body as {
    round: { id: string; version: number; matches: { team1: string[]; team2: string[] }[] };
  };
}

describe('round generation', () => {
  it('generates a valid round and stores generator metadata', async () => {
    const cookie = await adminCookie();
    const { sessionId } = await liveSession(cookie, 8);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/rounds`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'gen-1' },
      payload: { mode: 'BALANCED_ELO', seed: 'test-seed-1' },
    });
    expect(res.statusCode).toBe(201);
    const { round } = roundFrom(res.json());
    expect(round.matches).toHaveLength(2);
    const stored = await prisma.round.findFirst({ where: { id: round.id } });
    expect(stored?.seed).toBe('test-seed-1');
    expect(stored?.generatorVersion?.startsWith('match-generator@')).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'round.generate' } })).toBe(1);
  });

  it('replays the same response for the same idempotency key', async () => {
    const cookie = await adminCookie();
    const { sessionId } = await liveSession(cookie, 8);
    const headers = { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'gen-dup' };
    const payload = { mode: 'RANDOM', seed: 'dup-seed' };
    const first = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/rounds`,
      headers,
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/rounds`,
      headers,
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ replayed: true });
    expect(await prisma.round.count({ where: { openPlayId: sessionId } })).toBe(1);
  });
});

describe('swaps', () => {
  it('swaps two playing players and bumps version', async () => {
    const cookie = await adminCookie();
    const { sessionId } = await liveSession(cookie, 8);
    const gen = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/rounds`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'swap-setup' },
      payload: { seed: 'swap-1' },
    });
    const { round } = roundFrom(gen.json());
    const a = round.matches[0]?.team1[0];
    const b = round.matches[0]?.team1[1];
    if (a === undefined || b === undefined) throw new Error('need players');
    const swap = await app.inject({
      method: 'POST',
      url: `/api/rounds/${round.id}/swaps`,
      headers: { cookie, ...csrfHeaders },
      payload: { expectedRoundVersion: round.version, a: { playerId: a }, b: { playerId: b } },
    });
    expect(swap.statusCode).toBe(200);
    expect(swap.json()).toMatchObject({ round: { version: round.version + 1 } });
    expect(await prisma.auditLog.count({ where: { action: 'round.swap' } })).toBe(1);
  });

  it('rejects swaps after a match starts', async () => {
    const cookie = await adminCookie();
    const { sessionId } = await liveSession(cookie, 8);
    const gen = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/rounds`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'started-swap' },
      payload: { seed: 's1' },
    });
    const { round } = roundFrom(gen.json());
    const match = await prisma.match.findFirst({ where: { roundId: round.id } });
    if (match === null) throw new Error('match missing');
    await app.inject({
      method: 'POST',
      url: `/api/matches/${match.id}/start`,
      headers: { cookie, ...csrfHeaders },
    });
    const [a, b] = [round.matches[0]?.team1[0], round.matches[0]?.team2[0]];
    if (a === undefined || b === undefined) throw new Error('players');
    const swap = await app.inject({
      method: 'POST',
      url: `/api/rounds/${round.id}/swaps`,
      headers: { cookie, ...csrfHeaders },
      payload: { expectedRoundVersion: round.version, a: { playerId: a }, b: { playerId: b } },
    });
    expect(swap.statusCode).toBe(409);
    expect(swap.json()).toMatchObject({ error: { code: 'MATCH_ALREADY_STARTED' } });
  });

  it('returns ROUND_CHANGED when version is stale (parallel admins)', async () => {
    const cookie = await adminCookie();
    const { sessionId } = await liveSession(cookie, 8);
    const gen = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/rounds`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'parallel-swap' },
      payload: { seed: 'p1' },
    });
    const { round } = roundFrom(gen.json());
    const players = round.matches.flatMap((m) => [...m.team1, ...m.team2]);
    const payload = {
      expectedRoundVersion: round.version,
      a: { playerId: players[0] ?? '' },
      b: { playerId: players[1] ?? '' },
    };
    const [r1, r2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/rounds/${round.id}/swaps`,
        headers: { cookie, ...csrfHeaders },
        payload,
      }),
      app.inject({
        method: 'POST',
        url: `/api/rounds/${round.id}/swaps`,
        headers: { cookie, ...csrfHeaders },
        payload,
      }),
    ]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const failed = r1.statusCode === 409 ? r1 : r2;
    expect(failed.json()).toMatchObject({ error: { code: 'ROUND_CHANGED' } });
  });
});

describe('manual rounds and delete', () => {
  it('creates, edits, and deletes the last unstarted round', async () => {
    const cookie = await adminCookie();
    const { sessionId, playerIds } = await liveSession(cookie, 4);
    const [p1, p2, p3, p4] = playerIds;
    if (!p1 || !p2 || !p3 || !p4) throw new Error('players');
    const manual = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/rounds/manual`,
      headers: { cookie, ...csrfHeaders },
      payload: {
        matches: [{ court: 1, team1: [p1, p2], team2: [p3, p4] }],
      },
    });
    expect(manual.statusCode).toBe(201);
    const roundId = roundFrom(manual.json()).round.id;

    await app.inject({
      method: 'PUT',
      url: `/api/rounds/${roundId}/manual`,
      headers: { cookie, ...csrfHeaders },
      payload: {
        matches: [{ court: 1, team1: [p1, p3], team2: [p2, p4] }],
      },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${sessionId}/rounds/last`,
      headers: { cookie, ...csrfHeaders },
    });
    expect(del.statusCode).toBe(200);
    expect(await prisma.round.count({ where: { openPlayId: sessionId } })).toBe(0);
  });
});
