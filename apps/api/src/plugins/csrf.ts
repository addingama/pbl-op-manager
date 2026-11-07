import { AppError, CSRF_HEADER, CSRF_HEADER_VALUE, ErrorCode } from '@pbl/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isLogin(request: FastifyRequest): boolean {
  return request.method === 'POST' && request.url.startsWith('/api/auth/login');
}

export function registerCsrf(app: FastifyInstance): void {
  app.addHook('preHandler', (request, _reply, done) => {
    if (!MUTATING.has(request.method) || isLogin(request)) {
      done();
      return;
    }
    const value = request.headers[CSRF_HEADER];
    if (value !== CSRF_HEADER_VALUE) {
      done(new AppError(ErrorCode.CSRF_REQUIRED, 403, 'Missing or invalid CSRF header'));
      return;
    }
    done();
  });
}
