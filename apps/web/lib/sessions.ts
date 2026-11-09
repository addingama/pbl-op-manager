import { sessionListItemSchema } from '@pbl/shared';
import { z } from 'zod';
import { apiGet } from '@/lib/api/server';

const sessionsResponseSchema = z.object({
  sessions: z.array(sessionListItemSchema),
});

export async function listSessions() {
  const data = await apiGet('/api/sessions', sessionsResponseSchema);
  return data?.sessions ?? [];
}

export function formatSessionWhen(startsAt: string): string {
  const d = new Date(startsAt);
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}
