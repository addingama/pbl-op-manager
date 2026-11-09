import type { PrismaClient } from '@pbl/database';
import {
  createPlayerBodySchema,
  createPlayerResponseSchema,
  parseBody,
  playerListItemSchema,
  playerProfileSchema,
  updatePlayerBodySchema,
} from '@pbl/shared';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../plugins/auth.js';
import { requestIdOf } from '../../lib/request.js';
import * as service from './service.js';

export function registerPlayerRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/players', async (request) => {
    const rows =
      request.actor.kind === 'admin'
        ? await service.listPlayersAdmin(prisma, request.actor)
        : await service.listPlayersPublic(prisma);
    return { players: playerListItemSchema.array().parse(rows) };
  });

  app.get('/players/:id', async (request) => {
    const { id } = request.params as { id: string };
    const profile = await service.getPlayerProfile(prisma, id);
    return playerProfileSchema.parse(profile);
  });

  app.post('/players', async (request) => {
    requireAdmin(request);
    const body = parseBody(createPlayerBodySchema, request.body);
    const result = await service.createPlayer(prisma, request.actor, body, {
      requestId: requestIdOf(request),
    });
    return createPlayerResponseSchema.parse(result);
  });

  app.patch('/players/:id', async (request) => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = parseBody(updatePlayerBodySchema, request.body);
    const player = await service.updatePlayer(prisma, request.actor, id, body, {
      requestId: requestIdOf(request),
    });
    return playerListItemSchema.parse(player);
  });
}
