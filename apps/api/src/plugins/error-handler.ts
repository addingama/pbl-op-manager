import { AppError, ErrorCode, toApiErrorBody } from '@pbl/shared';
import type { FastifyInstance } from 'fastify';

function fastifyErrorStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const code = Reflect.get(error, 'statusCode');
    if (typeof code === 'number') return code;
  }
  return 500;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.httpStatus).send(toApiErrorBody(error));
    }

    const statusCode = fastifyErrorStatus(error);
    if (statusCode === 429) {
      return reply
        .status(429)
        .send(toApiErrorBody(new AppError(ErrorCode.RATE_LIMITED, 429, 'Too many requests')));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send(toApiErrorBody(new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Internal server error')));
  });
}
