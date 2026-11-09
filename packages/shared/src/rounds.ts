import { z } from 'zod';
import { winnerTeamSchema } from './results.js';
import { generatorModeSchema } from './sessions.js';

const teamSchema = z.tuple([z.string().min(1), z.string().min(1)]);

export const generateRoundBodySchema = z.object({
  mode: generatorModeSchema.exclude(['MANUAL']).optional(),
  seed: z.string().min(1).max(200).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const manualMatchSchema = z.object({
  court: z.number().int().min(1).max(99),
  team1: teamSchema,
  team2: teamSchema,
});

export const manualRoundBodySchema = z.object({
  matches: z.array(manualMatchSchema).min(0).max(99),
  resting: z.array(z.string().min(1)).optional(),
});

export const swapSlotsBodySchema = z.object({
  expectedRoundVersion: z.number().int().nonnegative(),
  a: z.object({ playerId: z.string().min(1) }),
  b: z.object({ playerId: z.string().min(1) }),
});

export const roundMatchSchema = z.object({
  id: z.string(),
  courtNumber: z.number().int(),
  status: z.string(),
  team1: teamSchema,
  team2: teamSchema,
  winnerTeam: winnerTeamSchema.nullable().optional(),
  confirmedAt: z.string().nullable().optional(),
});

export const roundDetailSchema = z.object({
  id: z.string(),
  openPlayId: z.string(),
  number: z.number().int(),
  mode: generatorModeSchema,
  settings: z.record(z.string(), z.unknown()),
  seed: z.string().nullable(),
  generatorVersion: z.string().nullable(),
  ratingSnapshot: z.record(z.string(), z.unknown()),
  version: z.number().int(),
  matches: z.array(roundMatchSchema),
  resting: z.array(z.string()),
});

export type GenerateRoundBody = z.infer<typeof generateRoundBodySchema>;
export type ManualRoundBody = z.infer<typeof manualRoundBodySchema>;
export type SwapSlotsBody = z.infer<typeof swapSlotsBodySchema>;
