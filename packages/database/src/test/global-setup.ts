import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../client.js';
import { testDatabaseUrl } from '../env.js';

const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Recreates the integration-test database from scratch and applies every migration with
 * `prisma migrate deploy`, so each run also proves the migrations apply to an empty database.
 */
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
  } catch (error) {
    throw new Error(
      `Cannot prepare the test database at ${url.host}. Is Postgres running? Try \`pnpm db:up\`.`,
      { cause: error },
    );
  } finally {
    await admin.$disconnect();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
