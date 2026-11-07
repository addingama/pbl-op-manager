import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './env.js';
import { PrismaClient } from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  /** Defaults to DATABASE_URL (dev fallback outside production). */
  readonly url?: string;
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const adapter = new PrismaPg({ connectionString: options.url ?? databaseUrl() });
  return new PrismaClient({ adapter });
}

/**
 * Empties every application table (keeps the migration history). For dev seeding and
 * integration tests only.
 */
export async function truncateAllTables(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}
