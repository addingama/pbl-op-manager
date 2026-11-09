import { z } from 'zod';

export const winnerTeamSchema = z.union([z.literal(1), z.literal(2)]);

export const confirmMatchBodySchema = z.object({
  winnerTeam: winnerTeamSchema,
});

export const confirmAllMatchSchema = z.object({
  matchId: z.string().min(1),
  winnerTeam: winnerTeamSchema,
});

export const confirmAllBodySchema = z.object({
  results: z.array(confirmAllMatchSchema).min(1).max(99),
});

export const cancelMatchBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const correctMatchBodySchema = z.object({
  winnerTeam: winnerTeamSchema,
  reason: z.string().trim().min(1).max(500),
});

export const matchRatingChangeSchema = z.object({
  playerId: z.string(),
  team: winnerTeamSchema,
  result: z.union([z.literal(0), z.literal(1)]),
  ratingBefore: z.string(),
  ratingAfter: z.string(),
  delta: z.string(),
});

export const matchResultSchema = z.object({
  id: z.string(),
  roundId: z.string(),
  courtNumber: z.number().int(),
  status: z.string(),
  winnerTeam: winnerTeamSchema.nullable(),
  confirmedAt: z.string().nullable(),
  ratingChanges: z.array(matchRatingChangeSchema),
});

export type ConfirmMatchBody = z.infer<typeof confirmMatchBodySchema>;
export type ConfirmAllBody = z.infer<typeof confirmAllBodySchema>;
export type CancelMatchBody = z.infer<typeof cancelMatchBodySchema>;
export type CorrectMatchBody = z.infer<typeof correctMatchBodySchema>;
