const MAX_ROUND = 99_999;
const MAX_COURT = 99;

/**
 * Canonical Elo order key (ADR-015): session start → session id → round → court.
 * Fixed-width parts so plain string ordering equals canonical order.
 */
export function matchOrderKey(
  startsAt: Date,
  openPlayId: string,
  roundNumber: number,
  courtNumber: number,
): string {
  if (Number.isNaN(startsAt.getTime())) throw new RangeError('startsAt must be a valid date');
  if (openPlayId === '' || openPlayId.includes('|')) {
    throw new RangeError('openPlayId must be non-empty and must not contain "|"');
  }
  assertIntInRange(roundNumber, MAX_ROUND, 'roundNumber');
  assertIntInRange(courtNumber, MAX_COURT, 'courtNumber');
  return [
    startsAt.toISOString(),
    openPlayId,
    String(roundNumber).padStart(5, '0'),
    String(courtNumber).padStart(2, '0'),
  ].join('|');
}

function assertIntInRange(value: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${label} must be an integer in 1..${String(max)}`);
  }
}
