import type { PlayerSessionStats } from './history.js';
import type { Random } from './random.js';

interface Candidate<T> {
  readonly unit: T;
  readonly gamesPlayed: number;
  readonly lastPlayedRound: number | null;
  readonly tiebreak: number;
}

/**
 * Picks `count` units to play: fewest games first, then longest rest (never
 * played counts as longest), then a seeded tiebreak. `units` must already be in
 * a canonical order so the tiebreak is reproducible.
 */
export function selectByFairness<T>(
  units: readonly T[],
  count: number,
  statsOf: (unit: T) => PlayerSessionStats,
  random: Random,
): { selected: T[]; rest: T[] } {
  const candidates: Candidate<T>[] = units.map((unit) => {
    const stats = statsOf(unit);
    return {
      unit,
      gamesPlayed: stats.gamesPlayed,
      lastPlayedRound: stats.lastPlayedRound,
      tiebreak: random.next(),
    };
  });

  candidates.sort(
    (a, b) =>
      a.gamesPlayed - b.gamesPlayed ||
      (a.lastPlayedRound ?? Number.NEGATIVE_INFINITY) -
        (b.lastPlayedRound ?? Number.NEGATIVE_INFINITY) ||
      a.tiebreak - b.tiebreak,
  );

  return {
    selected: candidates.slice(0, count).map((c) => c.unit),
    rest: candidates.slice(count).map((c) => c.unit),
  };
}
