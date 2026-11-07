import { describe, expect, it } from 'vitest';
import { EloEngineError } from './errors.js';
import { foldLedger, ratingsOf } from './ledger.js';
import { applyRound } from './round.js';
import type { MatchResult } from './types.js';

const court1: MatchResult = {
  matchId: 'r1c1',
  team1: ['p1', 'p2'],
  team2: ['p3', 'p4'],
  winner: 1,
};
const court2: MatchResult = {
  matchId: 'r1c2',
  team1: ['p5', 'p6'],
  team2: ['p7', 'p8'],
  winner: 2,
};

const snapshot = new Map([
  ['p1', 1100],
  ['p2', 1000],
  ['p3', 1050],
  ['p4', 950],
  ['p5', 1000],
  ['p6', 1000],
  ['p7', 1000],
  ['p8', 1000],
  ['resting', 1234.5],
]);

describe('applyRound', () => {
  it('rates every parallel match against the pre-round snapshot', () => {
    const { changes } = applyRound([court1, court2], snapshot);
    expect(changes[0]?.changes.map((c) => c.ratingBefore)).toEqual([1100, 1000, 1050, 950]);
    expect(changes[1]?.changes.map((c) => c.ratingBefore)).toEqual([1000, 1000, 1000, 1000]);
    expect(changes[1]?.changes.map((c) => c.delta)).toEqual([-16, -16, 16, 16]);
  });

  it('does not depend on court order', () => {
    const forward = applyRound([court1, court2], snapshot);
    const reversed = applyRound([court2, court1], snapshot);
    expect(reversed.ratings).toEqual(forward.ratings);
  });

  it('carries resting players through unchanged', () => {
    const { ratings } = applyRound([court1, court2], snapshot);
    expect(ratings.get('resting')).toBe(1234.5);
    expect(ratings.get('p5')).toBe(984);
  });

  it('equals sequential application in canonical order', () => {
    const initial = new Map(
      [...snapshot].map(([id, rating]) => [
        id,
        { rating, peakRating: rating, matchesPlayed: 0, wins: 0, losses: 0 },
      ]),
    );
    const sequential = foldLedger(initial, [court1, court2]);
    expect(ratingsOf(sequential.state)).toEqual(applyRound([court1, court2], snapshot).ratings);
  });

  it('rejects a player booked in two matches of the same round', () => {
    const clash: MatchResult = {
      matchId: 'r1c3',
      team1: ['p1', 'p9'],
      team2: ['p10', 'p11'],
      winner: 1,
    };
    expect(() => applyRound([court1, clash], snapshot)).toThrow(EloEngineError);
    expect(() => applyRound([court1, clash], snapshot)).toThrow(/more than one match/);
  });
});
