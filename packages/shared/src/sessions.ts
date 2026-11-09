import { z } from 'zod';

export const sessionStatusSchema = z.enum(['DRAFT', 'OPEN', 'LIVE', 'COMPLETED', 'CANCELLED']);
export const visibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);
export const generatorModeSchema = z.enum([
  'RANDOM',
  'BALANCED_ELO',
  'MEXICANO',
  'AMERICANO',
  'FIXED_PARTNER',
  'MANUAL',
]);
export const participantStatusSchema = z.enum([
  'REGISTERED',
  'WAITLISTED',
  'ACTIVE',
  'UNAVAILABLE',
  'LEFT',
  'REMOVED',
]);

const startsAtSchema = z.union([z.iso.datetime(), z.coerce.date()]).transform((v) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  return d.toISOString();
});

export const createSessionBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: startsAtSchema,
  venue: z.string().trim().max(200).optional(),
  courtCount: z.number().int().min(1).max(99),
  capacity: z.number().int().min(1).max(999).nullable().optional(),
  visibility: visibilitySchema.optional(),
  defaultMode: generatorModeSchema.optional(),
});

export const updateSessionBodySchema = createSessionBodySchema.partial().extend({
  status: sessionStatusSchema.optional(),
});

export const addParticipantsBodySchema = z.object({
  playerIds: z.array(z.string().min(1)).min(1).max(100),
});

export const patchParticipantBodySchema = z.object({
  status: z.enum(['UNAVAILABLE', 'LEFT', 'REMOVED', 'REGISTERED', 'ACTIVE']),
});

export const sessionListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  startsAt: z.string(),
  venue: z.string().nullable(),
  courtCount: z.number().int(),
  capacity: z.number().int().nullable(),
  visibility: visibilitySchema,
  status: sessionStatusSchema,
  participantCount: z.number().int().nonnegative(),
});

export const participantSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  displayName: z.string(),
  status: participantStatusSchema,
  waitlistPos: z.number().int().nullable(),
  joinedAt: z.string(),
  leftAt: z.string().nullable(),
});

export const sessionDetailSchema = sessionListItemSchema.extend({
  defaultMode: generatorModeSchema,
  participants: z.array(participantSchema),
});

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type UpdateSessionBody = z.infer<typeof updateSessionBodySchema>;
export type AddParticipantsBody = z.infer<typeof addParticipantsBodySchema>;
