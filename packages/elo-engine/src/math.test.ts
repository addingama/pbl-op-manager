import { describe, expect, it } from 'vitest';
import { EloEngineError } from './errors.js';
import { displayRating, expectedScore, roundRating, teamRating } from './math.js';

describe('expectedScore', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(expectedScore(1437.25, 1437.25)).toBe(0.5);
  });

  it('matches the PRD formula for known gaps', () => {
    expect(expectedScore(1100, 1000)).toBeCloseTo(0.6400649998, 10);
    expect(expectedScore(1200, 1000)).toBeCloseTo(0.7597469266, 10);
    expect(expectedScore(1000, 1400)).toBeCloseTo(1 / 11, 12);
  });

  it('is complementary for the two sides', () => {
    expect(expectedScore(1234.5, 987.25) + expectedScore(987.25, 1234.5)).toBeCloseTo(1, 15);
  });

  it('rejects non-finite ratings', () => {
    expect(() => expectedScore(Number.NaN, 1000)).toThrow(EloEngineError);
    expect(() => expectedScore(1000, Number.POSITIVE_INFINITY)).toThrow(EloEngineError);
  });
});

describe('teamRating', () => {
  it('is the average of both players', () => {
    expect(teamRating(1200, 1000)).toBe(1100);
    expect(teamRating(1015.1234, 984.8766)).toBe(1000);
  });
});

describe('roundRating / displayRating', () => {
  it('rounds to 4 decimals and never yields -0', () => {
    expect(roundRating(11.517920001)).toBe(11.5179);
    expect(roundRating(-20.482079)).toBe(-20.4821);
    expect(Object.is(roundRating(-0.00001), 0)).toBe(true);
  });

  it('displays integers', () => {
    expect(displayRating(1015.4999)).toBe(1015);
    expect(displayRating(1015.5)).toBe(1016);
    expect(displayRating(984.5)).toBe(985);
  });
});
