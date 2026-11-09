import type { z } from 'zod';
import { AppError, ErrorCode } from './errors.js';

export function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Validation failed', {
      issues: parsed.error.issues.map((i) => ({
        path: i.path.map(String).join('.'),
        message: i.message,
      })),
    });
  }
  return parsed.data;
}

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Validation failed', {
      issues: parsed.error.issues.map((i) => ({
        path: i.path.map(String).join('.'),
        message: i.message,
      })),
    });
  }
  return parsed.data;
}
