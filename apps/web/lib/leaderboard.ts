import {
  type LeaderboardQuery,
  leaderboardQuerySchema,
  leaderboardResponseSchema,
} from '@pbl/shared';
import { apiGet } from '@/lib/api/server';

export async function fetchLeaderboard(query: LeaderboardQuery) {
  const q = leaderboardQuerySchema.parse(query);
  const params = new URLSearchParams({
    tab: q.tab,
    limit: String(q.limit),
    offset: String(q.offset),
  });
  return apiGet(`/api/leaderboard?${params.toString()}`, leaderboardResponseSchema);
}
