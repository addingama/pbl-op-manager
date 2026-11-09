import type { PrismaClient } from '@pbl/database';
import {
  addParticipantsBodySchema,
  createSessionBodySchema,
  parseBody,
  patchParticipantBodySchema,
  sessionDetailSchema,
  sessionListItemSchema,
  sessionStandingsResponseSchema,
  updateSessionBodySchema,
} from '@pbl/shared';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../plugins/auth.js';
import { requestIdOf } from '../../lib/request.js';
import * as service from './service.js';

export function registerSessionRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/sessions', async (request) => {
    const sessions = await service.listSessions(prisma, request.actor);
    return { sessions: sessionListItemSchema.array().parse(sessions) };
  });

  app.get('/sessions/:id', async (request) => {
    const { id } = request.params as { id: string };
    const session = await service.getSession(prisma, request.actor, id);
    return sessionDetailSchema.parse(session);
  });

  app.get('/sessions/:id/standings', async (request) => {
    const { id } = request.params as { id: string };
    const result = await service.getSessionStandings(prisma, request.actor, id);
    return sessionStandingsResponseSchema.parse(result);
  });

  app.post('/sessions', async (request) => {
    requireAdmin(request);
    const body = parseBody(createSessionBodySchema, request.body);
    const session = await service.createSession(prisma, request.actor, body, {
      requestId: requestIdOf(request),
    });
    return sessionDetailSchema.parse(session);
  });

  app.patch('/sessions/:id', async (request) => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = parseBody(updateSessionBodySchema, request.body);
    const session = await service.updateSession(prisma, request.actor, id, body, {
      requestId: requestIdOf(request),
    });
    return sessionDetailSchema.parse(session);
  });

  app.post('/sessions/:id/participants', async (request) => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = parseBody(addParticipantsBodySchema, request.body);
    const result = await service.addParticipants(prisma, request.actor, id, body, {
      requestId: requestIdOf(request),
    });
    return result;
  });

  app.delete('/sessions/:id/participants/:playerId', async (request) => {
    requireAdmin(request);
    const { id, playerId } = request.params as { id: string; playerId: string };
    const participant = await service.removeParticipant(prisma, request.actor, id, playerId, {
      requestId: requestIdOf(request),
    });
    return { participant };
  });

  app.patch('/sessions/:id/participants/:playerId', async (request) => {
    requireAdmin(request);
    const { id, playerId } = request.params as { id: string; playerId: string };
    const body = parseBody(patchParticipantBodySchema, request.body);
    const participant = await service.patchParticipant(
      prisma,
      request.actor,
      id,
      playerId,
      body.status,
      { requestId: requestIdOf(request) },
    );
    return { participant };
  });

  app.post('/sessions/:id/participants/:playerId/promote', async (request) => {
    requireAdmin(request);
    const { id, playerId } = request.params as { id: string; playerId: string };
    const participant = await service.promoteParticipant(prisma, request.actor, id, playerId, {
      requestId: requestIdOf(request),
    });
    return { participant };
  });
}
