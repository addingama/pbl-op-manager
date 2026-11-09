import { roundDetailSchema, sessionRoundsResponseSchema } from '@pbl/shared';
import type { z } from 'zod';

export type RoundDetail = z.infer<typeof roundDetailSchema>;

export function parseRound(data: unknown): RoundDetail {
  return roundDetailSchema.parse(data);
}

export function parseRoundsResponse(data: unknown): RoundDetail[] {
  return sessionRoundsResponseSchema.parse(data).rounds;
}

export function latestRound(rounds: readonly RoundDetail[]): RoundDetail | null {
  if (rounds.length === 0) return null;
  return rounds.reduce((a, b) => (b.number > a.number ? b : a));
}
