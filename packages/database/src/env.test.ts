import { afterEach, describe, expect, it } from 'vitest';
import { databaseUrl, DEV_DATABASE_URL, testDatabaseUrl } from './env.js';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe('database URLs', () => {
  it('derives the test database name from DATABASE_URL', () => {
    delete process.env['TEST_DATABASE_URL'];
    process.env['DATABASE_URL'] = 'postgresql://u:p@db:5432/app?schema=public';
    expect(testDatabaseUrl()).toBe('postgresql://u:p@db:5432/app_test?schema=public');
  });

  it('prefers an explicit TEST_DATABASE_URL', () => {
    process.env['TEST_DATABASE_URL'] = 'postgresql://u:p@db:5432/other_test';
    expect(testDatabaseUrl()).toBe('postgresql://u:p@db:5432/other_test');
  });

  it('falls back to the dev database only outside production', () => {
    delete process.env['DATABASE_URL'];
    process.env['NODE_ENV'] = 'development';
    expect(databaseUrl()).toBe(DEV_DATABASE_URL);
    process.env['NODE_ENV'] = 'production';
    expect(() => databaseUrl()).toThrow(/DATABASE_URL must be set/);
  });
});
