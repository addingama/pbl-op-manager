import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const compose = readFileSync(resolve(repoRoot, 'docker-compose.yml'), 'utf8');

describe('docker-compose.yml contract', () => {
  it('does not publish postgres to the host', () => {
    const postgresIdx = compose.indexOf('  postgres:');
    const nextServiceIdx = compose.indexOf('\n  migrate:', postgresIdx);
    const postgresBlock = compose.slice(postgresIdx, nextServiceIdx);
    expect(postgresBlock).toContain('postgres:');
    expect(postgresBlock).not.toContain('ports:');
  });

  it('includes migrate, api, web, nginx, backup, and certbot', () => {
    for (const svc of ['migrate', 'api', 'web', 'nginx', 'backup', 'certbot'] as const) {
      expect(compose).toContain(`  ${svc}:`);
    }
  });

  it('pins backup retention default', () => {
    expect(compose).toContain('BACKUP_RETENTION_DAYS');
  });
});
