import cookie from '@fastify/cookie';
import { createPrismaClient, type PrismaClient } from '@pbl/database';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthContext } from './plugins/auth.js';
import { registerCsrf } from './plugins/csrf.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRequestContext } from './plugins/request-context.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerDevRoutes } from './modules/dev/routes.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerPlayerRoutes } from './modules/players/routes.js';
import { registerSessionRoutes } from './modules/sessions/routes.js';
import { registerRoundRoutes } from './modules/rounds/routes.js';
import { registerResultRoutes } from './modules/results/routes.js';
import './lib/request.js';

export interface BuildServerOptions {
  readonly prisma?: PrismaClient;
  readonly logger?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const prisma = options.prisma ?? createPrismaClient();
  const app = Fastify({
    logger: options.logger ?? process.env['NODE_ENV'] !== 'test',
  });

  await app.register(cookie, { hook: 'onRequest' });

  registerErrorHandler(app);
  registerRequestContext(app);
  registerCsrf(app);
  registerAuthContext(app, prisma);

  await app.register(
    async (api) => {
      registerHealthRoutes(api, prisma);
      await registerAuthRoutes(api, prisma);
      registerPlayerRoutes(api, prisma);
      registerSessionRoutes(api, prisma);
      registerRoundRoutes(api, prisma);
      registerResultRoutes(api, prisma);
      registerDevRoutes(api);
    },
    { prefix: '/api' },
  );

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}
