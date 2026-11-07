import { healthResponseSchema } from '@pbl/shared';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@pbl/database';
import { requestIdOf } from '../../lib/request.js';

export function registerHealthRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/health', async (request) => {
    const database: 'ok' | 'down' = await prisma.$queryRaw`SELECT 1`
      .then(() => 'ok' as const)
      .catch(() => 'down' as const);
    return healthResponseSchema.parse({
      status: 'ok',
      requestId: requestIdOf(request),
      database,
    });
  });
}
