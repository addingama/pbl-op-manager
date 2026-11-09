import { z } from 'zod';
import { playerListItemSchema, ratingSchema } from './players.js';

export const leaderboardTabSchema = z.enum(['ranked', 'provisional']);

export const leaderboardQuerySchema = z.object({
  tab: leaderboardTabSchema.default('ranked'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const leaderboardEntrySchema = playerListItemSchema.omit({ ranked: true }).extend({
  status: z.enum(['ranked', 'provisional']),
  rank: z.number().int().positive().nullable(),
  peakRating: ratingSchema,
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
});

export const leaderboardResponseSchema = z.object({
  tab: leaderboardTabSchema,
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
  entries: z.array(leaderboardEntrySchema),
});

export const ratingHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ratingHistoryPointSchema = z.object({
  matchId: z.string(),
  orderKey: z.string(),
  at: z.string(),
  ratingAfter: ratingSchema,
  delta: ratingSchema,
  result: z.union([z.literal(0), z.literal(1)]),
});

export const ratingHistoryResponseSchema = z.object({
  playerId: z.string(),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
  points: z.array(ratingHistoryPointSchema),
});

export const recentMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const recentMatchSchema = z.object({
  matchId: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  roundNumber: z.number().int(),
  courtNumber: z.number().int(),
  playedAt: z.string(),
  won: z.boolean(),
});

export const recentMatchesResponseSchema = z.object({
  playerId: z.string(),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
  matches: z.array(recentMatchSchema),
});

export const monthlyActivityQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(12),
});

export const monthlyActivityRowSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  matchesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
});

export const monthlyActivityResponseSchema = z.object({
  playerId: z.string(),
  timezone: z.literal('Asia/Jakarta'),
  months: z.array(monthlyActivityRowSchema),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type RatingHistoryQuery = z.infer<typeof ratingHistoryQuerySchema>;
export type RecentMatchesQuery = z.infer<typeof recentMatchesQuerySchema>;
export type MonthlyActivityQuery = z.infer<typeof monthlyActivityQuerySchema>;
