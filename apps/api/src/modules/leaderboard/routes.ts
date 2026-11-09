import type { PrismaClient } from '@pbl/database';
import {
  leaderboardQuerySchema,
  leaderboardResponseSchema,
  monthlyActivityQuerySchema,
  monthlyActivityResponseSchema,
  parseQuery,
  ratingHistoryQuerySchema,
  ratingHistoryResponseSchema,
  recentMatchesQuerySchema,
  recentMatchesResponseSchema,
} from '@pbl/shared';
import type { FastifyInstance } from 'fastify';
import * as service from './service.js';

export function registerLeaderboardRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/leaderboard', async (request) => {
    const query = parseQuery(leaderboardQuerySchema, request.query);
    const result = await service.listLeaderboard(prisma, query);
    return leaderboardResponseSchema.parse(result);
  });

  app.get('/players/:id/rating-history', async (request) => {
    const { id } = request.params as { id: string };
    const query = parseQuery(ratingHistoryQuerySchema, request.query);
    const result = await service.getRatingHistory(prisma, id, query);
    return ratingHistoryResponseSchema.parse(result);
  });

  app.get('/players/:id/recent-matches', async (request) => {
    const { id } = request.params as { id: string };
    const query = parseQuery(recentMatchesQuerySchema, request.query);
    const result = await service.getRecentMatches(prisma, id, query);
    return recentMatchesResponseSchema.parse(result);
  });

  app.get('/players/:id/monthly-activity', async (request) => {
    const { id } = request.params as { id: string };
    const query = parseQuery(monthlyActivityQuerySchema, request.query);
    const result = await service.getMonthlyActivity(prisma, id, query);
    return monthlyActivityResponseSchema.parse(result);
  });
}
