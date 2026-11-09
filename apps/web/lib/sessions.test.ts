import { describe, expect, it } from 'vitest';
import { formatSessionWhen } from './sessions';

describe('formatSessionWhen', () => {
  it('formats UTC instant in Jakarta locale', () => {
    const formatted = formatSessionWhen('2026-06-01T05:30:00.000Z');
    expect(formatted).toMatch(/2026/);
    expect(formatted.length).toBeGreaterThan(8);
  });
});
