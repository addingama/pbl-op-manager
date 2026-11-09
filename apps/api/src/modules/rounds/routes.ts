import type { PrismaClient } from '@pbl/database';
import {
  AppError,
  ErrorCode,
  generateRoundBodySchema,
  IDEMPOTENCY_HEADER,
  manualRoundBodySchema,
  parseBody,
  roundDetailSchema,
  swapSlotsBodySchema,
} from '@pbl/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAdmin } from '../../plugins/auth.js';
import { requestIdOf } from '../../lib/request.js';
import * as service from './service.js';

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers[IDEMPOTENCY_HEADER];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Idempotency-Key header is required');
  }
  return value.trim();
}

export function registerRoundRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/rounds/:roundId', async (request) => {
    const { roundId } = request.params as { roundId: string };
    const round = await service.getRound(prisma, request.actor, roundId);
    return roundDetailSchema.parse(round);
  });

  app.post('/sessions/:sessionId/rounds', async (request, reply) => {
    requireAdmin(request);
    const { sessionId } = request.params as { sessionId: string };
    const body = parseBody(generateRoundBodySchema, request.body);
    const key = idempotencyKey(request);
    const result = await service.generateSessionRound(prisma, request.actor, sessionId, body, key, {
      requestId: requestIdOf(request),
    });
    reply.status(result.replayed ? 200 : result.status);
    return { round: roundDetailSchema.parse(result.round), replayed: result.replayed };
  });

  app.post('/sessions/:sessionId/rounds/manual', async (request, reply) => {
    requireAdmin(request);
    const { sessionId } = request.params as { sessionId: string };
    const body = parseBody(manualRoundBodySchema, request.body);
    const round = await service.createManualRound(prisma, request.actor, sessionId, body, {
      requestId: requestIdOf(request),
    });
    reply.status(201);
    return { round: roundDetailSchema.parse(round) };
  });

  app.put('/rounds/:roundId/manual', async (request) => {
    requireAdmin(request);
    const { roundId } = request.params as { roundId: string };
    const body = parseBody(manualRoundBodySchema, request.body);
    const round = await service.updateManualRound(prisma, request.actor, roundId, body, {
      requestId: requestIdOf(request),
    });
    return { round: roundDetailSchema.parse(round) };
  });

  app.delete('/sessions/:sessionId/rounds/last', async (request) => {
    requireAdmin(request);
    const { sessionId } = request.params as { sessionId: string };
    return service.deleteLastUnstartedRound(prisma, request.actor, sessionId, {
      requestId: requestIdOf(request),
    });
  });

  app.post('/rounds/:roundId/start', async (request) => {
    requireAdmin(request);
    const { roundId } = request.params as { roundId: string };
    const round = await service.startRound(prisma, request.actor, roundId, {
      requestId: requestIdOf(request),
    });
    return { round: roundDetailSchema.parse(round) };
  });

  app.post('/matches/:matchId/start', async (request) => {
    requireAdmin(request);
    const { matchId } = request.params as { matchId: string };
    const round = await service.startMatch(prisma, request.actor, matchId, {
      requestId: requestIdOf(request),
    });
    return { round: roundDetailSchema.parse(round) };
  });

  app.post('/rounds/:roundId/swaps', async (request) => {
    requireAdmin(request);
    const { roundId } = request.params as { roundId: string };
    const body = parseBody(swapSlotsBodySchema, request.body);
    const round = await service.swapSlots(prisma, request.actor, roundId, body, {
      requestId: requestIdOf(request),
    });
    return { round: roundDetailSchema.parse(round) };
  });
}
