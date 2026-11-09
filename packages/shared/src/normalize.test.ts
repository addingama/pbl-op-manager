import { describe, expect, it } from 'vitest';
import { levenshtein, normalizeDisplayName } from './normalize.js';

describe('normalizeDisplayName', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeDisplayName('  Ádi  ')).toBe('adi');
  });
});

describe('levenshtein', () => {
  it('scores edits', () => {
    expect(levenshtein('adi', 'adi')).toBe(0);
    expect(levenshtein('adi', 'ado')).toBe(1);
  });
});
