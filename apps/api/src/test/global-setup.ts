import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@pbl/database';
import { testDatabaseUrl } from '@pbl/database';

const DB_PACKAGE = fileURLToPath(new URL('../../../../packages/database', import.meta.url));

export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!/^\w+_test$/.test(dbName)) {
    throw new Error(`Refusing to recreate "${dbName}": test database names must end in "_test".`);
  }

  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = '/postgres';
  const admin = createPrismaClient({ url: maintenanceUrl.toString() });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: DB_PACKAGE,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
