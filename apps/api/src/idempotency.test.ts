import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '@pbl/shared';
import { hashRequestBody, runIdempotent } from './lib/idempotency.js';
import { resetDb, testPrisma } from './test/helpers.js';

const prisma = testPrisma();

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runIdempotent', () => {
  it('replays the stored response when the key and body hash match', async () => {
    let runs = 0;
    const key = 'key-1';
    const body = { n: 1 };
    const hash = hashRequestBody(body);

    const first = await runIdempotent({
      prisma,
      scope: 'test',
      key,
      requestHash: hash,
      run: () => {
        runs++;
        return Promise.resolve({ answer: 42 });
      },
      toStored: (v) => ({ status: 200, body: v }),
      fromStored: (_s, b) => b as { answer: number },
    });
    expect(first.replayed).toBe(false);
    expect(first.value).toEqual({ answer: 42 });
    expect(runs).toBe(1);

    const second = await runIdempotent({
      prisma,
      scope: 'test',
      key,
      requestHash: hash,
      run: () => {
        runs++;
        return Promise.resolve({ answer: 99 });
      },
      toStored: (v) => ({ status: 200, body: v }),
      fromStored: (_s, b) => b as { answer: number },
    });
    expect(second.replayed).toBe(true);
    expect(second.value).toEqual({ answer: 42 });
    expect(runs).toBe(1);
  });

  it('rejects the same key with a different body hash', async () => {
    await runIdempotent({
      prisma,
      scope: 'test',
      key: 'k2',
      requestHash: hashRequestBody({ a: 1 }),
      run: () => Promise.resolve('ok'),
      toStored: (v) => ({ status: 200, body: v }),
      fromStored: (_s, b) => (typeof b === 'string' ? b : JSON.stringify(b)),
    });

    await expect(
      runIdempotent({
        prisma,
        scope: 'test',
        key: 'k2',
        requestHash: hashRequestBody({ a: 2 }),
        run: () => Promise.resolve('nope'),
        toStored: (v) => ({ status: 200, body: v }),
        fromStored: (_s, b) => (typeof b === 'string' ? b : JSON.stringify(b)),
      }),
    ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_REUSED });
  });

  it('stores audit rows from the helper consumer in the same transaction', async () => {
    await runIdempotent({
      prisma,
      scope: 'audit-test',
      key: 'k3',
      requestHash: hashRequestBody(null),
      run: async (tx) => {
        await tx.auditLog.create({
          data: {
            action: 'test.idempotent',
            entityType: 'Test',
            entityId: '1',
          },
        });
        return { done: true };
      },
      toStored: (v) => ({ status: 201, body: v }),
      fromStored: (_s, b) => b as { done: boolean },
    });
    expect(await prisma.auditLog.count({ where: { action: 'test.idempotent' } })).toBe(1);
  });
});

describe('hashRequestBody', () => {
  it('is stable for the same JSON shape', () => {
    expect(hashRequestBody({ z: 1, a: 2 })).toBe(hashRequestBody({ z: 1, a: 2 }));
  });

  it('differs when content differs', () => {
    expect(hashRequestBody({ a: 1 })).not.toBe(hashRequestBody({ a: 2 }));
  });
});

describe('AppError idempotency codes', () => {
  it('exposes HTTP statuses for route mapping', () => {
    const err = new AppError(ErrorCode.IDEMPOTENCY_IN_PROGRESS, 409, 'busy');
    expect(err.httpStatus).toBe(409);
  });
});
