import type { TransactionClient } from './transaction-client.js';

/** Single global advisory lock for all Elo ledger writes (ADR-006). */
export const ELO_ADVISORY_LOCK_KEY = 847_392_847;

export async function acquireEloAdvisoryLock(tx: TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ELO_ADVISORY_LOCK_KEY}::bigint)`;
}
