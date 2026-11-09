import type { PrismaClient } from '@pbl/database';
import {
  adminListResponseSchema,
  adminUserSchema,
  appSettingsResponseSchema,
  changePasswordBodySchema,
  createAdminBodySchema,
  parseBody,
  patchAdminBodySchema,
  updateAppDefaultsSchema,
} from '@pbl/shared';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../plugins/auth.js';
import { requestIdOf } from '../../lib/request.js';
import * as service from './service.js';

export function registerSettingsRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/settings', async () => {
    const result = await service.getAppSettings(prisma);
    return appSettingsResponseSchema.parse(result);
  });

  app.patch('/settings', async (request) => {
    requireAdmin(request);
    const body = parseBody(updateAppDefaultsSchema, request.body);
    const result = await service.updateAppSettings(prisma, request.actor, body, {
      requestId: requestIdOf(request),
    });
    return appSettingsResponseSchema.parse(result);
  });

  app.get('/admins', async (request) => {
    requireAdmin(request);
    const result = await service.listAdmins(prisma, request.actor);
    return adminListResponseSchema.parse(result);
  });

  app.post('/admins', async (request) => {
    requireAdmin(request);
    const body = parseBody(createAdminBodySchema, request.body);
    const result = await service.createAdmin(prisma, request.actor, body, {
      requestId: requestIdOf(request),
    });
    return { admin: adminUserSchema.parse(result.admin) };
  });

  app.patch('/admins/:id', async (request) => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = parseBody(patchAdminBodySchema, request.body);
    const result = await service.patchAdmin(prisma, request.actor, id, body.active, {
      requestId: requestIdOf(request),
    });
    return { admin: adminUserSchema.parse(result.admin) };
  });

  app.post('/auth/change-password', async (request) => {
    requireAdmin(request);
    const body = parseBody(changePasswordBodySchema, request.body);
    return service.changePassword(prisma, request.actor, body, {
      requestId: requestIdOf(request),
    });
  });
}
