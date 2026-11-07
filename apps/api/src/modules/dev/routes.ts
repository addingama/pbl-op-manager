import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../plugins/auth.js';

/** Protected mutation stub for M4 auth tests (removed in production builds). */
export function registerDevRoutes(app: FastifyInstance): void {
  if (process.env['NODE_ENV'] === 'production') return;

  app.post('/dev/mutate-check', (request) => {
    requireAdmin(request);
    return { ok: true, actor: request.actor };
  });
}
