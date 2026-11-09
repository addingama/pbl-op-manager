import { describe, expect, it } from 'vitest';
import { backupFileAgeMs, shouldPruneBackup } from './backup-retention.js';

describe('backup-retention', () => {
  it('parses backup timestamps', () => {
    const now = Date.parse('2026-06-15T12:00:00Z');
    const age = backupFileAgeMs('pbl_20260601T030000Z.sql.gz', now);
    expect(age).toBeGreaterThan(14 * 24 * 60 * 60 * 1000);
  });

  it('prunes files older than retention', () => {
    const now = Date.parse('2026-06-15T12:00:00Z');
    expect(shouldPruneBackup('pbl_20260501T030000Z.sql.gz', now, 14)).toBe(true);
    expect(shouldPruneBackup('pbl_20260614T030000Z.sql.gz', now, 14)).toBe(false);
  });
});
