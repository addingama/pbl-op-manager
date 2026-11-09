import { RANKED_MATCH_THRESHOLD } from '@pbl/elo-engine';

export function isRanked(matchesPlayed: number): boolean {
  return matchesPlayed >= RANKED_MATCH_THRESHOLD;
}

export function ratingNumber(rating: { toFixed(n: number): string }): string {
  return rating.toFixed(4);
}
