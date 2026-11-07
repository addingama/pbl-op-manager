import { describe, expect, it } from 'vitest';
import { INITIAL_RATING, K_FACTOR } from './constants.js';
import { foldLedger, ratingsOf } from './ledger.js';
import { applyRound } from './round.js';
import type { LedgerState, MatchResult } from './types.js';

/** mulberry32: tiny seeded PRNG so these checks are reproducible without extra deps. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** Random session: rounds of disjoint matches drawn from a player pool. */
function randomRounds(
  seed: number,
  players: number,
  courts: number,
  rounds: number,
): MatchResult[][] {
  const random = prng(seed);
  const pool = Array.from({ length: players }, (_, i) => `p${String(i)}`);
  return Array.from({ length: rounds }, (_, r) => {
    const picked = shuffle(pool, random);
    return Array.from({ length: courts }, (_, c): MatchResult => {
      const [a, b, x, y] = picked.slice(c * 4, c * 4 + 4) as [string, string, string, string];
      return {
        matchId: `s${String(seed)}r${String(r)}c${String(c)}`,
        team1: [a, b],
        team2: [x, y],
        winner: random() < 0.5 ? 1 : 2,
      };
    });
  });
}

const isFourDecimals = (n: number) => Math.abs(n * 1e4 - Math.round(n * 1e4)) < 1e-6;
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

describe('properties over seeded random sessions', () => {
  it.each(SEEDS)('seed %i: per-match invariants hold', (seed) => {
    const { history } = foldLedger(new Map(), randomRounds(seed, 14, 3, 12).flat());
    for (const match of history) {
      const deltas = match.changes.map((c) => c.delta);
      expect(deltas[0]).toBe(deltas[1]);
      expect(deltas[2]).toBe(deltas[3]);
      expect(deltas.reduce((sum, d) => sum + d, 0)).toBe(0);
      for (const change of match.changes) {
        expect(Math.abs(change.delta)).toBeLessThan(K_FACTOR);
        expect(change.delta > 0).toBe(change.result === 1);
        expect(isFourDecimals(change.ratingAfter)).toBe(true);
      }
    }
  });

  it.each(SEEDS)('seed %i: total rating is conserved', (seed) => {
    const { state } = foldLedger(new Map(), randomRounds(seed, 14, 3, 12).flat());
    const total = [...state.values()].reduce((sum, p) => sum + p.rating, 0);
    expect(total).toBeCloseTo(INITIAL_RATING * state.size, 6);
  });

  it.each(SEEDS)(
    'seed %i: snapshot rounds equal sequential fold and replay equals fresh fold',
    (seed) => {
      const rounds = randomRounds(seed, 16, 4, 10);
      const all = rounds.flat();

      let ratings: ReadonlyMap<string, number> = new Map();
      for (const round of rounds) ratings = applyRound(round, ratings).ratings;
      const fresh = foldLedger(new Map(), all);
      expect(ratingsOf(fresh.state)).toEqual(ratings);

      const random = prng(seed * 7919);
      const flip = Math.floor(random() * all.length);
      const corrected = all.map((match, i) =>
        i === flip ? { ...match, winner: match.winner === 1 ? (2 as const) : (1 as const) } : match,
      );
      const prefix: LedgerState = foldLedger(new Map(), corrected.slice(0, flip)).state;
      const replayed = foldLedger(prefix, corrected.slice(flip));
      expect(replayed.state).toEqual(foldLedger(new Map(), corrected).state);
    },
  );
});
