/**
 * Name of the Postgres constraint/index a write violated, or undefined. Handles Prisma known
 * request errors (P2002 unique, P2039 check) and the bare driver-adapter error raised when a
 * DEFERRED constraint fails at COMMIT (e.g. a bad swap), which carries no Prisma code.
 */
export function violatedConstraint(error: unknown): string | undefined {
  const cause = driverCause(error);
  if (cause === undefined) return undefined;
  const constraint = cause['constraint'];
  if (isRecord(constraint) && typeof constraint['index'] === 'string') return constraint['index'];
  const message = cause['originalMessage'] ?? cause['message'];
  if (typeof message !== 'string') return undefined;
  return /constraint "([^"]+)"/.exec(message)?.[1];
}

function driverCause(error: unknown): Record<string, unknown> | undefined {
  if (!isRecord(error)) return undefined;
  const meta = error['meta'];
  if (isRecord(meta) && isRecord(meta['driverAdapterError'])) {
    const cause = meta['driverAdapterError']['cause'];
    return isRecord(cause) ? cause : undefined;
  }
  if (error['name'] === 'DriverAdapterError' && isRecord(error['cause'])) return error['cause'];
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
