import { EloEngineError } from './errors.js';
import { matchDeltas, matchPlayers } from './match.js';
import type { MatchRatingChange, MatchResult, PlayerId, RatingSnapshot } from './types.js';

export interface RoundResult {
  /** Snapshot after the round: input ratings updated with every match's ratingAfter. */
  readonly ratings: ReadonlyMap<PlayerId, number>;
  readonly changes: readonly MatchRatingChange[];
}

/**
 * Rates all parallel matches of one round against the same pre-round snapshot.
 * A player may appear in at most one match of the round.
 */
export function applyRound(
  matches: readonly MatchResult[],
  preRoundRatings: RatingSnapshot,
): RoundResult {
  const seen = new Set<PlayerId>();
  for (const match of matches) {
    for (const playerId of matchPlayers(match)) {
      if (seen.has(playerId)) {
        throw new EloEngineError(
          'PLAYER_IN_MULTIPLE_MATCHES',
          `player ${playerId} appears in more than one match of the round`,
        );
      }
      seen.add(playerId);
    }
  }

  const changes = matches.map((match) => matchDeltas(match, preRoundRatings));
  const ratings = new Map(preRoundRatings);
  for (const match of changes) {
    for (const change of match.changes) {
      ratings.set(change.playerId, change.ratingAfter);
    }
  }
  return { ratings, changes };
}
