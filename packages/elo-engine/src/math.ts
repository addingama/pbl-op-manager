import { RATING_DECIMALS, RATING_SCALE } from './constants.js';
import { EloEngineError } from './errors.js';

const SCALE = 10 ** RATING_DECIMALS;

/** Rounds to the stored precision. Math.round semantics (half toward +∞); never returns -0. */
export function roundRating(value: number): number {
  const rounded = Math.round(value * SCALE) / SCALE;
  return rounded === 0 ? 0 : rounded;
}

/** Integer shown in the UI. */
export function displayRating(rating: number): number {
  return Math.round(rating);
}

export function assertValidRating(rating: number, label = 'rating'): void {
  if (!Number.isFinite(rating)) {
    throw new EloEngineError(
      'INVALID_RATING',
      `${label} must be a finite number, got ${String(rating)}`,
    );
  }
}

/** Expected(A) = 1 / (1 + 10^((R_B − R_A) / 400)). */
export function expectedScore(ratingA: number, ratingB: number): number {
  assertValidRating(ratingA, 'ratingA');
  assertValidRating(ratingB, 'ratingB');
  return 1 / (1 + 10 ** ((ratingB - ratingA) / RATING_SCALE));
}

/** Team rating = average of its two players' ratings. */
export function teamRating(ratingA: number, ratingB: number): number {
  assertValidRating(ratingA, 'ratingA');
  assertValidRating(ratingB, 'ratingB');
  return (ratingA + ratingB) / 2;
}
