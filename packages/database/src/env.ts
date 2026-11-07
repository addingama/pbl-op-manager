import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Matches docker-compose.dev.yml / .env.example; only used outside production. */
export const DEV_DATABASE_URL = 'postgresql://pbl:pbl_dev_password@localhost:5433/pbl_openplay';

const ROOT_ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));

let rootEnvLoaded = false;

/** Loads the repo-root `.env` (if present) without overriding variables already set. */
export function loadRootEnv(): void {
  if (rootEnvLoaded) return;
  rootEnvLoaded = true;
  if (existsSync(ROOT_ENV_FILE)) process.loadEnvFile(ROOT_ENV_FILE);
}

export function databaseUrl(): string {
  loadRootEnv();
  const url = process.env['DATABASE_URL'];
  if (url) return url;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('DATABASE_URL must be set in production');
  }
  return DEV_DATABASE_URL;
}

/**
 * Integration tests use their own database on the same server (`<name>_test` unless
 * TEST_DATABASE_URL is set), so running tests never touches dev data.
 */
export function testDatabaseUrl(): string {
  loadRootEnv();
  const explicit = process.env['TEST_DATABASE_URL'];
  if (explicit) return explicit;
  const url = new URL(databaseUrl());
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
  return url.toString();
}
