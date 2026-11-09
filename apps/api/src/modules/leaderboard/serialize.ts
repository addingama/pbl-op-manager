import { rankingStatus } from '@pbl/elo-engine';
import { isRanked, ratingNumber } from '../../lib/ranked.js';

type PlayerRow = {
  id: string;
  displayName: string;
  rating: { toFixed(n: number): string };
  peakRating: { toFixed(n: number): string };
  matchesPlayed: number;
  wins: number;
  losses: number;
  active: boolean;
};

export function baseStats(p: PlayerRow) {
  const matches = p.matchesPlayed;
  return {
    id: p.id,
    displayName: p.displayName,
    rating: ratingNumber(p.rating),
    matchesPlayed: p.matchesPlayed,
    active: p.active,
    peakRating: ratingNumber(p.peakRating),
    wins: p.wins,
    losses: p.losses,
    winRate: matches > 0 ? p.wins / matches : null,
    status: rankingStatus(p.matchesPlayed),
    ranked: isRanked(p.matchesPlayed),
  };
}

export function assignCompetitionRanks<T extends { rating: string }>(
  entries: readonly T[],
): (T & { rank: number })[] {
  let rank = 0;
  let position = 0;
  let prev: string | null = null;
  return entries.map((entry) => {
    position += 1;
    if (entry.rating !== prev) rank = position;
    prev = entry.rating;
    return { ...entry, rank };
  });
}
