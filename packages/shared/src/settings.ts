import { z } from 'zod';
import { generatorModeSchema, visibilitySchema } from './sessions.js';

export const RANKED_THRESHOLD = 10;

export const appDefaultsSchema = z.object({
  defaultMode: generatorModeSchema,
  defaultCourtCount: z.number().int().min(1).max(99),
  defaultVisibility: visibilitySchema,
  rankedThreshold: z.literal(RANKED_THRESHOLD),
});

export const updateAppDefaultsSchema = z.object({
  defaultMode: generatorModeSchema.optional(),
  defaultCourtCount: z.number().int().min(1).max(99).optional(),
  defaultVisibility: visibilitySchema.optional(),
});

export const appSettingsResponseSchema = z.object({
  defaults: appDefaultsSchema,
});

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  active: z.boolean(),
  lastLoginAt: z.string().nullable(),
});

export const adminListResponseSchema = z.object({
  admins: z.array(adminUserSchema),
});

export const createAdminBodySchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(120),
});

export const patchAdminBodySchema = z.object({
  active: z.boolean(),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export type AppDefaults = z.infer<typeof appDefaultsSchema>;
export type UpdateAppDefaults = z.infer<typeof updateAppDefaultsSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type CreateAdminBody = z.infer<typeof createAdminBodySchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
