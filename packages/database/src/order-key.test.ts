import { describe, expect, it } from 'vitest';
import { matchOrderKey } from './order-key.js';

describe('matchOrderKey', () => {
  const startsAt = new Date('2026-11-07T12:00:00.000Z');

  it('formats session start, session id, round and court with fixed widths', () => {
    expect(matchOrderKey(startsAt, 'abc', 3, 2)).toBe('2026-11-07T12:00:00.000Z|abc|00003|02');
  });

  it('sorts as strings in canonical order: session start, then round, then court', () => {
    const keys = [
      matchOrderKey(new Date('2026-11-08T12:00:00.000Z'), 'a', 1, 1),
      matchOrderKey(startsAt, 'z', 10, 1),
      matchOrderKey(startsAt, 'z', 2, 10),
      matchOrderKey(startsAt, 'z', 2, 9),
    ];
    expect([...keys].sort()).toEqual([keys[3], keys[2], keys[1], keys[0]]);
  });

  it('rejects out-of-range or malformed parts', () => {
    expect(() => matchOrderKey(new Date('nope'), 'a', 1, 1)).toThrow(RangeError);
    expect(() => matchOrderKey(startsAt, 'a|b', 1, 1)).toThrow(RangeError);
    expect(() => matchOrderKey(startsAt, '', 1, 1)).toThrow(RangeError);
    expect(() => matchOrderKey(startsAt, 'a', 0, 1)).toThrow(RangeError);
    expect(() => matchOrderKey(startsAt, 'a', 1, 100)).toThrow(RangeError);
    expect(() => matchOrderKey(startsAt, 'a', 1.5, 1)).toThrow(RangeError);
  });
});
