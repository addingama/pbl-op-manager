import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const adminMeSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
});

export type AdminMe = z.infer<typeof adminMeSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  requestId: z.string(),
  database: z.enum(['ok', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
