import { z } from 'zod';

const ratingSchema = z.union([z.string(), z.number()]).transform(String);

export const createPlayerBodySchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export const updatePlayerBodySchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

export const playerListItemSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  rating: ratingSchema,
  matchesPlayed: z.number().int().nonnegative(),
  active: z.boolean(),
  ranked: z.boolean(),
});

export const playerProfileSchema = playerListItemSchema.extend({
  peakRating: ratingSchema,
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
});

export const playerWarningSchema = z.object({
  kind: z.literal('SIMILAR_NAME'),
  players: z.array(z.object({ id: z.string(), displayName: z.string() })),
});

export const createPlayerResponseSchema = z.object({
  player: playerListItemSchema,
  warnings: z.array(playerWarningSchema).optional(),
});

export type CreatePlayerBody = z.infer<typeof createPlayerBodySchema>;
export type UpdatePlayerBody = z.infer<typeof updatePlayerBodySchema>;
