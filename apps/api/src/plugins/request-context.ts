import { randomUUID } from 'node:crypto';
import { GUEST_ACTOR } from '@pbl/shared';
import type { FastifyInstance } from 'fastify';

export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', (request, reply, done) => {
    const incoming = request.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    request.requestId = id;
    request.actor = GUEST_ACTOR;
    reply.header('x-request-id', id);
    done();
  });
}
