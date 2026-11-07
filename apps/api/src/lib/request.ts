import type { Actor } from '@pbl/shared';
import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
    requestId: string;
  }
}

export function requestIdOf(request: FastifyRequest): string {
  return request.requestId;
}
