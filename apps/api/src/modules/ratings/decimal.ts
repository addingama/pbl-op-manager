import { RATING_DECIMALS } from '@pbl/elo-engine';
import { Prisma } from '@pbl/database';

export function decimalFromNumber(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(RATING_DECIMALS));
}

export function decimalString(value: number): string {
  return value.toFixed(RATING_DECIMALS);
}

export function numberFromDecimal(value: { toFixed(n: number): string }): number {
  return Number(value.toFixed(RATING_DECIMALS));
}
