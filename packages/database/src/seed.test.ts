import { foldLedger, type MatchResult, type Team } from '@pbl/elo-engine';
import { validateRound } from '@pbl/match-generator';
import { verify } from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SEED_COMPLETED_SESSION,
  SEED_DRAFT_SESSION,
  SEED_PLAYER_NAMES,
  seedDevData,
  type SeedSummary,
} from './seed.js';
import { createTestClient } from './test/fixtures.js';

const prisma = createTestClient();
const admin = { email: 'Admin@PBL.local', password: 'test-only-password' };
let summary: SeedSummary;

beforeAll(async () => {
  summary = await seedDevData(prisma, admin);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function ratingsByName(): Promise<Record<string, string>> {
  const players = await prisma.player.findMany({ orderBy: { displayName: 'asc' } });
  return Object.fromEntries(players.map((p) => [p.displayName, p.rating.toFixed(4)]));
}

function team(ids: readonly string[]): Team {
  const [a, b] = ids;
  if (a === undefined || b === undefined || ids.length !== 2) throw new Error('bad team');
  return [a, b];
}

describe('dev seed', () => {
  it('creates one admin with a lowercase email and an argon2id hash', async () => {
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    const [user] = users;
    expect(user?.email).toBe('admin@pbl.local');
    expect(user?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verify(user?.passwordHash ?? '', admin.password)).toBe(true);
  });

  it('creates 20 players, a completed session and a draft session', async () => {
    expect(summary).toMatchObject({ players: 20, sessions: 2, rounds: 8, matches: 32 });
    expect(await prisma.player.count()).toBe(SEED_PLAYER_NAMES.length);
    const sessions = await prisma.openPlay.findMany({
      include: { participants: true },
      orderBy: { startsAt: 'asc' },
    });
    expect(sessions.map((s) => s.status)).toEqual(['COMPLETED', 'DRAFT']);
    expect(sessions[0]?.participants).toHaveLength(20);
    expect(sessions[1]?.participants).toHaveLength(SEED_DRAFT_SESSION.registered);
  });

  it('stores valid generated rounds with one assignment per participant', async () => {
    const rounds = await prisma.round.findMany({
      include: { matches: true, assignments: true },
      orderBy: { number: 'asc' },
    });
    expect(rounds.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const round of rounds) {
      expect(round.mode).toBe('BALANCED_ELO');
      expect(round.generatorVersion).toMatch(/^match-generator@\d+\.\d+\.\d+$/);
      expect(round.assignments).toHaveLength(20);
      expect(round.assignments.filter((a) => a.status === 'PLAYING')).toHaveLength(16);
      const matches = round.matches.map((m) => {
        const slots = round.assignments
          .filter((a) => a.matchId === m.id)
          .sort((x, y) => (x.team ?? 0) - (y.team ?? 0) || (x.position ?? 0) - (y.position ?? 0));
        const ids = slots.map((a) => a.playerId);
        return { court: m.courtNumber, team1: team(ids.slice(0, 2)), team2: team(ids.slice(2)) };
      });
      const eligible = round.assignments.map((a) => a.playerId);
      expect(validateRound(matches, SEED_COMPLETED_SESSION.courts, eligible)).toEqual([]);
    }
  });

  it('builds a ledger that a full replay in canonical order reproduces exactly', async () => {
    const matches = await prisma.match.findMany({
      where: { status: 'COMPLETED' },
      include: { assignments: true },
      orderBy: { orderKey: 'asc' },
    });
    const results: MatchResult[] = matches.map((m) => {
      const byTeam = (t: number) =>
        team(
          m.assignments
            .filter((a) => a.team === t)
            .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
            .map((a) => a.playerId),
        );
      const winner = m.winnerTeam === 1 ? 1 : 2;
      return { matchId: m.id, team1: byTeam(1), team2: byTeam(2), winner };
    });
    const replay = foldLedger(new Map(), results);

    const txns = await prisma.ratingTransaction.findMany({
      where: { supersededByRunId: null },
      orderBy: [{ orderKey: 'asc' }, { team: 'asc' }],
    });
    expect(txns).toHaveLength(summary.ratingTransactions);
    expect(summary.ratingTransactions).toBe(32 * 4);
    for (const change of replay.history) {
      for (const c of change.changes) {
        const row = txns.find((t) => t.matchId === change.matchId && t.playerId === c.playerId);
        expect(row?.ratingAfter.toFixed(4)).toBe(c.ratingAfter.toFixed(4));
        expect(row?.delta.toFixed(4)).toBe(c.delta.toFixed(4));
      }
    }

    const players = await prisma.player.findMany();
    for (const p of players) {
      const state = replay.state.get(p.id);
      expect(p.rating.toFixed(4)).toBe((state?.rating ?? 1000).toFixed(4));
      expect(p.peakRating.toFixed(4)).toBe((state?.peakRating ?? 1000).toFixed(4));
      expect([p.matchesPlayed, p.wins, p.losses]).toEqual([
        state?.matchesPlayed ?? 0,
        state?.wins ?? 0,
        state?.losses ?? 0,
      ]);
    }
  });

  it('produces varied, zero-sum ratings', async () => {
    const players = await prisma.player.findMany();
    const total = players.reduce((sum, p) => sum + Number(p.rating.toFixed(4)), 0);
    expect(total.toFixed(4)).toBe((1000 * players.length).toFixed(4));
    expect(new Set(players.map((p) => p.rating.toFixed(0))).size).toBeGreaterThan(5);
  });

  it('is deterministic: re-seeding wipes and recreates identical results', async () => {
    const before = await ratingsByName();
    const again = await seedDevData(prisma, admin);
    expect({ ...again, adminId: '' }).toEqual({ ...summary, adminId: '' });
    expect(await prisma.user.count()).toBe(1);
    expect(await ratingsByName()).toEqual(before);
  });
});
