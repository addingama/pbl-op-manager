import { createPrismaClient } from '../src/client.js';
import { loadRootEnv } from '../src/env.js';
import { seedDevData } from '../src/seed.js';

loadRootEnv();

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('Refusing to run the dev seed with NODE_ENV=production (it wipes all data).');
}

const prisma = createPrismaClient();
try {
  const summary = await seedDevData(prisma, {
    email: process.env['SEED_ADMIN_EMAIL'] ?? 'admin@pbl.local',
    password: process.env['SEED_ADMIN_PASSWORD'] ?? 'pbl-dev-admin',
  });
  console.log('Seeded dev data:', summary);
} finally {
  await prisma.$disconnect();
}
