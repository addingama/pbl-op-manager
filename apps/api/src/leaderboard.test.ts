import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IDEMPOTENCY_HEADER } from '@pbl/shared';
import { RANKED_MATCH_THRESHOLD } from '@pbl/elo-engine';
import { adminSessionCookie, csrfHeaders, resetDb, testApp, testPrisma } from './test/helpers.js';
import { parseId } from './test/json.js';
import { z } from 'zod';
import {
  leaderboardResponseSchema,
  playerProfileSchema,
  ratingHistoryResponseSchema,
} from '@pbl/shared';

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

async function confirmOneMatch(cookie: string): Promise<string> {
  const ids: string[] = [];
  for (let i = 0; i < 8; i++) {
    const p = await prisma.player.create({
      data: {
        displayName: `LB${String(i + 1)}`,
        normalizedName: `lb${String(i + 1)}`,
      },
    });
    ids.push(p.id);
  }
  const created = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: { cookie, ...csrfHeaders },
    payload: {
      title: 'LB Session',
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
    headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: randomUUID() },
    payload: { seed: 'lb' },
  });
  const genRaw: unknown = gen.json();
  const matchId = z
    .object({ round: z.object({ matches: z.array(z.object({ id: z.string() })) }) })
    .parse(genRaw).round.matches[0]?.id;
  if (matchId === undefined) throw new Error('no match');
  await app.inject({
    method: 'POST',
    url: `/api/matches/${matchId}/confirm`,
    headers: { cookie, ...csrfHeaders, [IDEMPOTENCY_HEADER]: randomUUID() },
    payload: { winnerTeam: 1 },
  });
  return ids[0] ?? '';
}

describe('leaderboard', () => {
  it('is public and paginates ranked players', async () => {
    const cookie = await adminCookie();
    const winnerId = await confirmOneMatch(cookie);
    await prisma.player.update({
      where: { id: winnerId },
      data: { matchesPlayed: RANKED_MATCH_THRESHOLD, wins: 6, losses: 4 },
    });
    const board = await app.inject({
      method: 'GET',
      url: '/api/leaderboard?tab=ranked&limit=10&offset=0',
    });
    expect(board.statusCode).toBe(200);
    const body = leaderboardResponseSchema.parse(board.json());
    expect(body.tab).toBe('ranked');
    expect(body.entries.length).toBeGreaterThanOrEqual(1);
    expect(body.entries[0]?.rank).toBe(1);
  });

  it('keeps provisional players on the provisional tab', async () => {
    const cookie = await adminCookie();
    await confirmOneMatch(cookie);
    const prov = await app.inject({
      method: 'GET',
      url: '/api/leaderboard?tab=provisional',
    });
    const body = leaderboardResponseSchema.parse(prov.json());
    expect(body.entries.every((e) => e.status === 'provisional')).toBe(true);
    expect(body.entries.every((e) => e.rank === null)).toBe(true);
  });
});

describe('profile reads', () => {
  it('exposes rating history and stats aligned with ledger', async () => {
    const cookie = await adminCookie();
    const playerId = await confirmOneMatch(cookie);
    const profileRaw: unknown = (
      await app.inject({ method: 'GET', url: `/api/players/${playerId}` })
    ).json();
    const profile = playerProfileSchema.parse(profileRaw);
    expect(profile.status).toBe('provisional');
    expect(profile.matchesPlayed).toBe(1);

    const histRaw: unknown = (
      await app.inject({ method: 'GET', url: `/api/players/${playerId}/rating-history` })
    ).json();
    const hist = ratingHistoryResponseSchema.parse(histRaw);
    expect(hist.total).toBe(1);
    expect(hist.points[0]?.ratingAfter).toBe(profile.rating);

    const recentRaw: unknown = (
      await app.inject({ method: 'GET', url: `/api/players/${playerId}/recent-matches` })
    ).json();
    const recent = z.object({ matches: z.array(z.object({ won: z.boolean() })) }).parse(recentRaw);
    expect(recent.matches).toHaveLength(1);

    const monthlyRaw: unknown = (
      await app.inject({ method: 'GET', url: `/api/players/${playerId}/monthly-activity` })
    ).json();
    const monthly = z
      .object({
        timezone: z.literal('Asia/Jakarta'),
        months: z.array(z.object({ month: z.string() })),
      })
      .parse(monthlyRaw);
    expect(monthly.timezone).toBe('Asia/Jakarta');
    expect(monthly.months.length).toBeGreaterThanOrEqual(1);
  });
});
