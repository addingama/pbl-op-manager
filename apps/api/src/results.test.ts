import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IDEMPOTENCY_HEADER, matchResultSchema, roundDetailSchema } from '@pbl/shared';
import { z } from 'zod';
import { parseId } from './test/json.js';
import { adminSessionCookie, csrfHeaders, resetDb, testApp, testPrisma } from './test/helpers.js';
import { assertLedgerMatchesFold } from './modules/ratings/consistency.js';

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

async function liveSessionWithRound(cookie: string, playerCount = 8) {
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
  const gen = await app.inject({
    method: 'POST',
    url: `/api/sessions/${sessionId}/rounds`,
    headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: `round-${randomUUID()}` },
    payload: { seed: 'r1' },
  });
  const genRaw: unknown = gen.json();
  const { round } = z.object({ round: roundDetailSchema }).parse(genRaw);
  return { sessionId, roundId: round.id, matches: round.matches, playerIds: ids };
}

describe('match confirm', () => {
  it('confirms a match and updates ratings', async () => {
    const cookie = await adminCookie();
    const { matches, playerIds } = await liveSessionWithRound(cookie);
    const matchId = matches[0]?.id;
    if (matchId === undefined) throw new Error('no match');
    const res = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/confirm`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'c1' },
      payload: { winnerTeam: 1 },
    });
    expect(res.statusCode).toBe(200);
    const raw: unknown = res.json();
    const body = z.object({ match: matchResultSchema }).parse(raw);
    expect(body.match).toMatchObject({ status: 'COMPLETED', winnerTeam: 1 });
    expect(body.match.ratingChanges).toHaveLength(4);
    expect(body.match.ratingChanges.map((c) => c.playerId)).toContain(playerIds[0]);
    await assertLedgerMatchesFold(prisma);
    expect(await prisma.auditLog.count({ where: { action: 'match.confirm' } })).toBe(1);
  });

  it('replays idempotent confirm without duplicating ledger rows', async () => {
    const cookie = await adminCookie();
    const { matches } = await liveSessionWithRound(cookie);
    const matchId = matches[0]?.id ?? '';
    const headers = { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'dup-c' };
    const first = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/confirm`,
      headers,
      payload: { winnerTeam: 2 },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/confirm`,
      headers,
      payload: { winnerTeam: 2 },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ replayed: true });
    expect(
      await prisma.ratingTransaction.count({ where: { matchId, supersededByRunId: null } }),
    ).toBe(4);
  });

  it('parallel confirms on the same match apply Elo once', async () => {
    const cookie = await adminCookie();
    const { matches } = await liveSessionWithRound(cookie);
    const matchId = matches[0]?.id ?? '';
    const payload = { winnerTeam: 1 };
    const [a, b] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/matches/${matchId}/confirm`,
        headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'p-a' },
        payload,
      }),
      app.inject({
        method: 'POST',
        url: `/api/matches/${matchId}/confirm`,
        headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'p-b' },
        payload,
      }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 200]);
    expect(
      await prisma.ratingTransaction.count({ where: { matchId, supersededByRunId: null } }),
    ).toBe(4);
  });
});

describe('confirm-all', () => {
  it('confirms every match in one transaction', async () => {
    const cookie = await adminCookie();
    const { roundId, matches } = await liveSessionWithRound(cookie);
    const results = matches.map((m) => ({ matchId: m.id, winnerTeam: 1 }));
    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/confirm-all`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'all-1' },
      payload: { results },
    });
    expect(res.statusCode).toBe(200);
    const allRaw: unknown = res.json();
    const allBody = z.object({ matches: z.array(matchResultSchema) }).parse(allRaw);
    expect(allBody.matches).toHaveLength(2);
    await assertLedgerMatchesFold(prisma);
  });
});

describe('late confirm and correction', () => {
  it('late confirmation matches in-order fold', async () => {
    const cookie = await adminCookie();
    const { sessionId, matches: m1 } = await liveSessionWithRound(cookie);
    const gen2 = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/rounds`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: `r2-${randomUUID()}` },
      payload: { seed: 'r2' },
    });
    const gen2Raw: unknown = gen2.json();
    const { round: round2 } = z.object({ round: roundDetailSchema }).parse(gen2Raw);
    const late = round2.matches[0]?.id;
    const early = m1[0]?.id;
    if (late === undefined || early === undefined) throw new Error('matches');

    await app.inject({
      method: 'POST',
      url: `/api/matches/${late}/confirm`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'late-first' },
      payload: { winnerTeam: 1 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/matches/${early}/confirm`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'early-second' },
      payload: { winnerTeam: 1 },
    });
    await assertLedgerMatchesFold(prisma);
  });

  it('correction replays forward deterministically', async () => {
    const cookie = await adminCookie();
    const { matches } = await liveSessionWithRound(cookie);
    const matchId = matches[0]?.id ?? '';
    await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/confirm`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'corr-setup' },
      payload: { winnerTeam: 1 },
    });
    const correct = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/correct`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'corr-1' },
      payload: { winnerTeam: 2, reason: 'Wrong team tapped' },
    });
    expect(correct.statusCode).toBe(200);
    expect(await prisma.ratingRun.count({ where: { kind: 'REPLAY' } })).toBeGreaterThanOrEqual(1);
    await assertLedgerMatchesFold(prisma);
  });
});

describe('cancel', () => {
  it('cancelling a confirmed match replays without that match', async () => {
    const cookie = await adminCookie();
    const { matches } = await liveSessionWithRound(cookie);
    const matchId = matches[0]?.id ?? '';
    await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/confirm`,
      headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: 'cancel-setup' },
      payload: { winnerTeam: 1 },
    });
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/cancel`,
      headers: { cookie, ...csrfHeaders },
      payload: { reason: 'Weather' },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ match: { status: 'CANCELLED' } });
    expect(
      await prisma.ratingTransaction.count({ where: { matchId, supersededByRunId: null } }),
    ).toBe(0);
    await assertLedgerMatchesFold(prisma);
  });
});
