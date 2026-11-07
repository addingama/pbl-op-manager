import { describe, expect, it } from 'vitest';
import { EloEngineError } from './errors.js';
import { foldLedger, NEW_PLAYER_STATE } from './ledger.js';
import { isRanked, rankingStatus } from './status.js';
import type { LedgerState, MatchResult } from './types.js';

const empty: LedgerState = new Map();

const m = (
  matchId: string,
  team1: [string, string],
  team2: [string, string],
  winner: 1 | 2,
): MatchResult => ({
  matchId,
  team1,
  team2,
  winner,
});

const history: MatchResult[] = [
  m('s1r1c1', ['ana', 'bo'], ['cy', 'di'], 1),
  m('s1r1c2', ['ed', 'fa'], ['gu', 'hu'], 2),
  m('s1r2c1', ['ana', 'cy'], ['ed', 'gu'], 2),
  m('s1r2c2', ['bo', 'di'], ['fa', 'hu'], 1),
  m('s2r1c1', ['ana', 'hu'], ['bo', 'gu'], 1),
  m('s2r1c2', ['cy', 'fa'], ['di', 'ed'], 2),
  m('s2r2c1', ['ana', 'di'], ['fa', 'gu'], 2),
];

/** Replay from index `from`: fold the prefix, then refold the (possibly edited) suffix. */
function replayFrom(from: number, corrected: readonly MatchResult[]) {
  const prefix = foldLedger(empty, corrected.slice(0, from));
  const suffix = foldLedger(prefix.state, corrected.slice(from));
  return { state: suffix.state, history: [...prefix.history, ...suffix.history] };
}

describe('foldLedger', () => {
  it('starts everyone at 1000 and tracks stats', () => {
    const { state } = foldLedger(empty, history.slice(0, 1));
    expect(state.get('ana')).toEqual({
      rating: 1016,
      peakRating: 1016,
      matchesPlayed: 1,
      wins: 1,
      losses: 0,
    });
    expect(state.get('cy')).toEqual({
      rating: 984,
      peakRating: 1000,
      matchesPlayed: 1,
      wins: 0,
      losses: 1,
    });
    expect(state.has('zed')).toBe(false);
  });

  it('keeps the peak rating after a drop', () => {
    const { state } = foldLedger(empty, [
      m('1', ['x', 'y'], ['p', 'q'], 1),
      m('2', ['x', 'y'], ['p', 'q'], 2),
    ]);
    const x = state.get('x') ?? NEW_PLAYER_STATE;
    expect(x.peakRating).toBe(1016);
    expect(x.rating).toBeLessThan(1016);
    expect(x).toMatchObject({ matchesPlayed: 2, wins: 1, losses: 1 });
  });

  it('is deterministic', () => {
    expect(foldLedger(empty, history)).toEqual(foldLedger(empty, history));
  });

  it('does not mutate the initial state', () => {
    const initial: LedgerState = new Map([
      ['ana', { ...NEW_PLAYER_STATE, rating: 1200, peakRating: 1200 }],
    ]);
    const copy = new Map(initial);
    foldLedger(initial, history);
    expect(initial).toEqual(copy);
  });

  it('produces the same result as a fresh fold when a corrected result is replayed', () => {
    const correctedIndex = 2;
    const corrected = history.map((match, i) =>
      i === correctedIndex
        ? { ...match, winner: match.winner === 1 ? (2 as const) : (1 as const) }
        : match,
    );
    const replayed = replayFrom(correctedIndex, corrected);
    const fresh = foldLedger(empty, corrected);
    expect(replayed.state).toEqual(fresh.state);
    expect(replayed.history).toEqual(fresh.history);

    const original = foldLedger(empty, history);
    expect(fresh.state).not.toEqual(original.state);
    expect(fresh.history.slice(0, correctedIndex)).toEqual(
      original.history.slice(0, correctedIndex),
    );
  });

  it('produces the same result as a fresh fold when a confirmed match is cancelled', () => {
    const cancelledIndex = 1;
    const remaining = history.filter((_, i) => i !== cancelledIndex);
    expect(replayFrom(cancelledIndex, remaining).state).toEqual(foldLedger(empty, remaining).state);
  });

  it('handles a late confirmation of an earlier match by replaying in canonical order', () => {
    const lateIndex = 3;
    const confirmedSoFar = history.filter((_, i) => i !== lateIndex);
    const afterLate = replayFrom(lateIndex, history);
    expect(afterLate.state).toEqual(foldLedger(empty, history).state);
    expect(afterLate.state).not.toEqual(foldLedger(empty, confirmedSoFar).state);
  });

  it('rejects duplicate match ids', () => {
    const first = history[0];
    if (!first) throw new Error('fixture');
    expect(() => foldLedger(empty, [first, first])).toThrow(EloEngineError);
  });
});

describe('ranking status', () => {
  it('is provisional below 10 completed matches and ranked from 10', () => {
    expect(isRanked(0)).toBe(false);
    expect(rankingStatus(9)).toBe('provisional');
    expect(rankingStatus(10)).toBe('ranked');
    expect(isRanked(57)).toBe(true);
  });

  it('flips after the 10th folded match', () => {
    const tenMatches = Array.from({ length: 10 }, (_, i) =>
      m(`g${String(i)}`, ['solo', `t${String(i)}`], [`o${String(i)}a`, `o${String(i)}b`], 1),
    );
    const afterNine = foldLedger(empty, tenMatches.slice(0, 9)).state.get('solo');
    const afterTen = foldLedger(empty, tenMatches).state.get('solo');
    expect(rankingStatus(afterNine?.matchesPlayed ?? 0)).toBe('provisional');
    expect(rankingStatus(afterTen?.matchesPlayed ?? 0)).toBe('ranked');
  });
});
