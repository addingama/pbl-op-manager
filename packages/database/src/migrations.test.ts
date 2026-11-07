import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './env.js';
import { createTestClient } from './test/fixtures.js';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const prisma = createTestClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migrations', () => {
  // The global setup built this database from empty with `prisma migrate deploy`.
  it('leave no drift between the migrated database and schema.prisma', async () => {
    const { stdout } = await promisify(execFile)(
      'pnpm',
      [
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--script',
        '--exit-code',
      ],
      { cwd: PACKAGE_DIR, env: { ...process.env, DATABASE_URL: testDatabaseUrl() } },
    );
    expect(stdout).toContain('This is an empty migration.');
  });

  it('create the deferrable round/player unique constraint', async () => {
    const rows = await prisma.$queryRaw<{ condeferrable: boolean; condeferred: boolean }[]>`
      SELECT condeferrable, condeferred FROM pg_constraint
      WHERE conname = 'RoundAssignment_roundId_playerId_key'`;
    expect(rows).toEqual([{ condeferrable: true, condeferred: true }]);
  });

  it('create every raw-SQL partial unique index', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexdef LIKE '%WHERE%' ORDER BY indexname`;
    expect(rows.map((r) => r.indexname)).toEqual([
      'PlayerAlias_generic_aliasKey_key',
      'RatingTransaction_active_match_player_key',
      'RoundAssignment_match_slot_key',
    ]);
  });

  it('store timestamps as timestamptz', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
        AND data_type = 'timestamp without time zone'`;
    expect(rows).toEqual([]);
  });
});
