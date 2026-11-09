import type { PrismaClient } from '@pbl/database';
import {
  AppError,
  ErrorCode,
  cancelMatchBodySchema,
  confirmAllBodySchema,
  confirmMatchBodySchema,
  correctMatchBodySchema,
  IDEMPOTENCY_HEADER,
  matchResultSchema,
  parseBody,
} from '@pbl/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAdmin } from '../../plugins/auth.js';
import { requestIdOf } from '../../lib/request.js';
import * as service from './service.js';
import { z } from 'zod';

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers[IDEMPOTENCY_HEADER];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Idempotency-Key header is required');
  }
  return value.trim();
}

const confirmAllResponseSchema = z.object({
  matches: z.array(matchResultSchema),
  replayed: z.boolean().optional(),
});

export function registerResultRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.post('/matches/:matchId/confirm', async (request) => {
    requireAdmin(request);
    const { matchId } = request.params as { matchId: string };
    const body = parseBody(confirmMatchBodySchema, request.body);
    const key = idempotencyKey(request);
    const result = await service.confirmMatch(prisma, request.actor, matchId, body, key, {
      requestId: requestIdOf(request),
    });
    return {
      match: matchResultSchema.parse(result.match),
      replayed: result.replayed,
    };
  });

  app.post('/rounds/:roundId/confirm-all', async (request) => {
    requireAdmin(request);
    const { roundId } = request.params as { roundId: string };
    const body = parseBody(confirmAllBodySchema, request.body);
    const key = idempotencyKey(request);
    const result = await service.confirmAllRound(prisma, request.actor, roundId, body, key, {
      requestId: requestIdOf(request),
    });
    return confirmAllResponseSchema.parse({ ...result, replayed: result.replayed });
  });

  app.post('/matches/:matchId/cancel', async (request) => {
    requireAdmin(request);
    const { matchId } = request.params as { matchId: string };
    const body = parseBody(cancelMatchBodySchema, request.body);
    const match = await service.cancelMatch(prisma, request.actor, matchId, body, {
      requestId: requestIdOf(request),
    });
    return { match: matchResultSchema.parse(match) };
  });

  app.post('/matches/:matchId/correct', async (request) => {
    requireAdmin(request);
    const { matchId } = request.params as { matchId: string };
    const body = parseBody(correctMatchBodySchema, request.body);
    const key = idempotencyKey(request);
    const result = await service.correctMatch(prisma, request.actor, matchId, body, key, {
      requestId: requestIdOf(request),
    });
    return {
      match: matchResultSchema.parse(result.match),
      replayed: result.replayed,
    };
  });
}
