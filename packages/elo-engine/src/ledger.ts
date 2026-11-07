import { INITIAL_RATING } from './constants.js';
import { EloEngineError } from './errors.js';
import { matchDeltas } from './match.js';
import type {
  FoldResult,
  LedgerState,
  MatchRatingChange,
  MatchResult,
  PlayerId,
  PlayerState,
} from './types.js';

export const NEW_PLAYER_STATE: PlayerState = {
  rating: INITIAL_RATING,
  peakRating: INITIAL_RATING,
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
};

export function ratingsOf(state: LedgerState): ReadonlyMap<PlayerId, number> {
  return new Map([...state].map(([playerId, player]) => [playerId, player.rating]));
}

/**
 * Folds confirmed results, already sorted in canonical order (session start →
 * round → court), over an initial state. Replay = fold from the state just
 * before the earliest affected match; a full rebuild = fold from an empty map.
 * Matches within one round have disjoint players, so sequential application
 * equals the pre-round snapshot rule.
 */
export function foldLedger(
  initial: LedgerState,
  orderedResults: readonly MatchResult[],
): FoldResult {
  const state = new Map(initial);
  const history: MatchRatingChange[] = [];
  const matchIds = new Set<string>();

  for (const match of orderedResults) {
    if (matchIds.has(match.matchId)) {
      throw new EloEngineError(
        'DUPLICATE_MATCH_ID',
        `match ${match.matchId} appears more than once`,
      );
    }
    matchIds.add(match.matchId);

    const ratings = new Map(
      [...match.team1, ...match.team2].map((id) => [
        id,
        (state.get(id) ?? NEW_PLAYER_STATE).rating,
      ]),
    );
    const change = matchDeltas(match, ratings);
    history.push(change);

    for (const { playerId, result, ratingAfter } of change.changes) {
      const prev = state.get(playerId) ?? NEW_PLAYER_STATE;
      state.set(playerId, {
        rating: ratingAfter,
        peakRating: Math.max(prev.peakRating, ratingAfter),
        matchesPlayed: prev.matchesPlayed + 1,
        wins: prev.wins + result,
        losses: prev.losses + (1 - result),
      });
    }
  }

  return { state, history };
}
