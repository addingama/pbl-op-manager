import type { Prisma, PrismaClient } from '@pbl/database';
import { AppError, ErrorCode } from '@pbl/shared';
import { createHash } from 'node:crypto';

const IN_FLIGHT_MS = 60_000;
const DEFAULT_TTL_HOURS = 24;

export function hashRequestBody(body: unknown): string {
  const canonical = JSON.stringify(body ?? null);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export interface IdempotentResult<T> {
  readonly value: T;
  readonly replayed: boolean;
}

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;

export interface RunIdempotentOptions<T> {
  readonly prisma: PrismaClient;
  readonly scope: string;
  readonly key: string;
  readonly requestHash: string;
  readonly run: (tx: Tx) => Promise<T>;
  readonly toStored: (value: T) => {
    readonly status: number;
    readonly body: Prisma.InputJsonValue;
  };
  readonly fromStored: (status: number, body: Prisma.JsonValue) => T;
}

function handleExisting<T>(
  existing: {
    requestHash: string;
    responseStatus: number | null;
    responseBody: Prisma.JsonValue | null;
    createdAt: Date;
  },
  options: RunIdempotentOptions<T>,
): IdempotentResult<T> | null {
  if (existing.requestHash !== options.requestHash) {
    throw new AppError(
      ErrorCode.IDEMPOTENCY_KEY_REUSED,
      422,
      'Idempotency-Key was already used with a different request body',
    );
  }
  if (existing.responseStatus !== null && existing.responseBody !== null) {
    return {
      value: options.fromStored(existing.responseStatus, existing.responseBody),
      replayed: true,
    };
  }
  const age = Date.now() - existing.createdAt.getTime();
  if (age < IN_FLIGHT_MS) {
    throw new AppError(
      ErrorCode.IDEMPOTENCY_IN_PROGRESS,
      409,
      'A request with this Idempotency-Key is still in progress',
    );
  }
  return null;
}

/**
 * Idempotency helper (ADR-008, DATABASE.md §6): claim the key in the same transaction as the
 * mutation; replay a stored response when the key and body hash match.
 */
export async function runIdempotent<T>(
  options: RunIdempotentOptions<T>,
): Promise<IdempotentResult<T>> {
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);
  const where = { scope_key: { scope: options.scope, key: options.key } };

  return options.prisma.$transaction(async (tx) => {
    const existing = await tx.idempotencyRecord.findUnique({ where });
    if (existing !== null) {
      const replayed = handleExisting(existing, options);
      if (replayed !== null) return replayed;
    } else {
      await tx.idempotencyRecord.create({
        data: {
          scope: options.scope,
          key: options.key,
          requestHash: options.requestHash,
          expiresAt,
        },
      });
    }

    const value = await options.run(tx);
    const stored = options.toStored(value);
    await tx.idempotencyRecord.update({
      where,
      data: {
        responseStatus: stored.status,
        responseBody: stored.body,
        requestHash: options.requestHash,
      },
    });
    return { value, replayed: false };
  });
}
