import { describe, expect, it } from 'vitest';
import { EloEngineError } from './errors.js';
import { matchDeltas } from './match.js';
import type { MatchResult } from './types.js';

const match = (winner: 1 | 2): MatchResult => ({
  matchId: 'm1',
  team1: ['a1', 'a2'],
  team2: ['b1', 'b2'],
  winner,
});

const ratings = (a1: number, a2: number, b1: number, b2: number) =>
  new Map([
    ['a1', a1],
    ['a2', a2],
    ['b1', b1],
    ['b2', b2],
  ]);

describe('matchDeltas', () => {
  it('gives ±16 when team ratings are equal', () => {
    const result = matchDeltas(match(1), ratings(1000, 1000, 1000, 1000));
    expect(result.deltaTeam1).toBe(16);
    expect(result.changes.map((c) => c.delta)).toEqual([16, 16, -16, -16]);
    expect(result.changes.map((c) => c.ratingAfter)).toEqual([1016, 1016, 984, 984]);
  });

  it('treats players missing from the snapshot as new (1000)', () => {
    const result = matchDeltas(match(2), new Map());
    expect(result.changes.map((c) => c.ratingBefore)).toEqual([1000, 1000, 1000, 1000]);
    expect(result.changes.map((c) => c.delta)).toEqual([-16, -16, 16, 16]);
  });

  it('gives the favourite a small gain and the underdog a large one', () => {
    const favWins = matchDeltas(match(1), ratings(1100, 1100, 1000, 1000));
    expect(favWins.deltaTeam1).toBe(11.5179);

    const upset = matchDeltas(match(2), ratings(1100, 1100, 1000, 1000));
    expect(upset.deltaTeam1).toBe(-20.4821);
    expect(upset.changes[2].delta).toBe(20.4821);

    const bigUpset = matchDeltas(match(2), ratings(1400, 1400, 1000, 1000));
    expect(bigUpset.changes[2].delta).toBe(29.0909);
  });

  it('uses the average of both teammates as the team rating', () => {
    const averaged = matchDeltas(match(1), ratings(1200, 1000, 1050, 950));
    expect(averaged.team1Rating).toBe(1100);
    expect(averaged.team2Rating).toBe(1000);
    expect(averaged.deltaTeam1).toBe(11.5179);
    expect(averaged.changes.map((c) => c.ratingAfter)).toEqual([
      1211.5179, 1011.5179, 1038.4821, 938.4821,
    ]);
  });

  it('gives teammates the same delta and is zero-sum', () => {
    const result = matchDeltas(match(2), ratings(1234.5678, 1087.1, 1150.0001, 999.9999));
    const [a1, a2, b1, b2] = result.changes;
    expect(a1.delta).toBe(a2.delta);
    expect(b1.delta).toBe(b2.delta);
    expect(b1.delta).toBe(-a1.delta);
    expect(a1.delta + a2.delta + b1.delta + b2.delta).toBe(0);
  });

  it('records the inputs needed for the ledger row', () => {
    const [a1, , b1] = matchDeltas(match(1), ratings(1100, 1100, 1000, 1000)).changes;
    expect(a1).toMatchObject({
      playerId: 'a1',
      team: 1,
      result: 1,
      teamRating: 1100,
      opponentRating: 1000,
    });
    expect(b1).toMatchObject({
      playerId: 'b1',
      team: 2,
      result: 0,
      teamRating: 1000,
      opponentRating: 1100,
    });
    expect(a1.expected + b1.expected).toBeCloseTo(1, 15);
  });

  it('rejects a match without 4 distinct players', () => {
    const bad: MatchResult = { matchId: 'x', team1: ['a1', 'a2'], team2: ['a2', 'b2'], winner: 1 };
    expect(() => matchDeltas(bad, new Map())).toThrow(EloEngineError);
    expect(() => matchDeltas(bad, new Map())).toThrow(/4 distinct players/);
  });
});
