import {
  sessionDetailSchema,
  sessionRoundsResponseSchema,
  sessionStandingsResponseSchema,
} from '@pbl/shared';
import { apiGet } from '@/lib/api/server';

export async function getSessionDetail(id: string) {
  return apiGet(`/api/sessions/${id}`, sessionDetailSchema);
}

export async function listSessionRounds(id: string) {
  const data = await apiGet(`/api/sessions/${id}/rounds`, sessionRoundsResponseSchema);
  return data?.rounds ?? [];
}

export async function getSessionStandings(id: string) {
  const data = await apiGet(`/api/sessions/${id}/standings`, sessionStandingsResponseSchema);
  return data?.standings ?? [];
}
