import {
  monthlyActivityResponseSchema,
  playerProfileSchema,
  ratingHistoryResponseSchema,
} from '@pbl/shared';
import { apiGet } from '@/lib/api/server';

export async function fetchPlayerProfile(id: string) {
  return apiGet(`/api/players/${id}`, playerProfileSchema);
}

export async function fetchRatingHistory(id: string) {
  return apiGet(`/api/players/${id}/rating-history?limit=200`, ratingHistoryResponseSchema);
}

export async function fetchMonthlyActivity(id: string) {
  return apiGet(`/api/players/${id}/monthly-activity?months=12`, monthlyActivityResponseSchema);
}
