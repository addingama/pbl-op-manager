import { RANKED_MATCH_THRESHOLD } from './constants.js';

export type RankingStatus = 'ranked' | 'provisional';

export function isRanked(matchesPlayed: number): boolean {
  return matchesPlayed >= RANKED_MATCH_THRESHOLD;
}

export function rankingStatus(matchesPlayed: number): RankingStatus {
  return isRanked(matchesPlayed) ? 'ranked' : 'provisional';
}
