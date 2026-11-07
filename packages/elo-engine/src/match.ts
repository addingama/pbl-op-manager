import { INITIAL_RATING, K_FACTOR } from './constants.js';
import { EloEngineError } from './errors.js';
import { expectedScore, roundRating, teamRating } from './math.js';
import type {
  MatchRatingChange,
  MatchResult,
  PlayerId,
  PlayerRatingChange,
  RatingSnapshot,
  TeamSide,
} from './types.js';

export function matchPlayers(match: MatchResult): readonly PlayerId[] {
  return [...match.team1, ...match.team2];
}

export function assertValidMatch(match: MatchResult): void {
  const players = matchPlayers(match);
  if (new Set(players).size !== players.length) {
    throw new EloEngineError(
      'DUPLICATE_PLAYER_IN_MATCH',
      `match ${match.matchId} must have 4 distinct players`,
    );
  }
}

function ratingOf(ratings: RatingSnapshot, playerId: PlayerId): number {
  return ratings.get(playerId) ?? INITIAL_RATING;
}

/**
 * Rating change for one match given the ratings before it. Players missing from
 * `ratings` start at INITIAL_RATING. Both teammates get the same delta and the
 * match is exactly zero-sum.
 */
export function matchDeltas(match: MatchResult, ratings: RatingSnapshot): MatchRatingChange {
  assertValidMatch(match);

  const [a1, a2] = match.team1;
  const [b1, b2] = match.team2;
  const before = {
    a1: ratingOf(ratings, a1),
    a2: ratingOf(ratings, a2),
    b1: ratingOf(ratings, b1),
    b2: ratingOf(ratings, b2),
  };

  const team1Rating = teamRating(before.a1, before.a2);
  const team2Rating = teamRating(before.b1, before.b2);
  const expectedTeam1 = expectedScore(team1Rating, team2Rating);
  const resultTeam1 = match.winner === 1 ? 1 : 0;
  const deltaTeam1 = roundRating(K_FACTOR * (resultTeam1 - expectedTeam1));
  const deltaTeam2 = deltaTeam1 === 0 ? 0 : -deltaTeam1;

  const change = (playerId: PlayerId, team: TeamSide, ratingBefore: number): PlayerRatingChange => {
    const isTeam1 = team === 1;
    const delta = isTeam1 ? deltaTeam1 : deltaTeam2;
    return {
      playerId,
      team,
      result: match.winner === team ? 1 : 0,
      ratingBefore,
      teamRating: isTeam1 ? team1Rating : team2Rating,
      opponentRating: isTeam1 ? team2Rating : team1Rating,
      expected: isTeam1 ? expectedTeam1 : 1 - expectedTeam1,
      delta,
      ratingAfter: roundRating(ratingBefore + delta),
    };
  };

  return {
    matchId: match.matchId,
    team1Rating,
    team2Rating,
    expectedTeam1,
    deltaTeam1,
    changes: [
      change(a1, 1, before.a1),
      change(a2, 1, before.a2),
      change(b1, 2, before.b1),
      change(b2, 2, before.b2),
    ],
  };
}
