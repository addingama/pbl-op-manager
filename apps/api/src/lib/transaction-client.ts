import type { PrismaClient } from '@pbl/database';

/** Prisma delegate surface inside `$transaction` and idempotent runs. */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;
