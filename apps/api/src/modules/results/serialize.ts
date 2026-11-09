import type { MatchRatingChange } from '@pbl/elo-engine';
import { serializeRatingChanges } from '../ratings/apply.js';

export function toMatchResultPayload(match: {
  id: string;
  roundId: string;
  courtNumber: number;
  status: string;
  winnerTeam: number | null;
  confirmedAt: Date | null;
  ratingChanges: ReturnType<typeof serializeRatingChanges>;
}) {
  return {
    id: match.id,
    roundId: match.roundId,
    courtNumber: match.courtNumber,
    status: match.status,
    winnerTeam: match.winnerTeam === 1 || match.winnerTeam === 2 ? match.winnerTeam : null,
    confirmedAt: match.confirmedAt?.toISOString() ?? null,
    ratingChanges: match.ratingChanges,
  };
}

export function ratingChangesFromHistory(history: readonly MatchRatingChange[], matchId: string) {
  const entry = history.find((h) => h.matchId === matchId);
  if (entry === undefined) return [];
  return serializeRatingChanges(entry);
}
