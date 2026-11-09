import { hash } from 'argon2';
import { createPrismaClient, loadRootEnv } from '@pbl/database';
import { createUser, findUserByEmail } from '../modules/auth/repo.js';

loadRootEnv();

if (process.env['NODE_ENV'] === 'production') {
  console.error('ensure-dev-admin is for local development only');
  process.exitCode = 1;
} else {
  const email = (process.env['SEED_ADMIN_EMAIL'] ?? 'admin@pbl.local').trim().toLowerCase();
  const password = process.env['SEED_ADMIN_PASSWORD'] ?? 'pbl-dev-admin';
  const displayName = process.env['SEED_ADMIN_DISPLAY_NAME'] ?? 'Dev Admin';

  const prisma = createPrismaClient();
  try {
    const existing = await findUserByEmail(prisma, email);
    if (existing !== null) {
      console.log(`Dev admin already exists: ${email}`);
    } else {
      const passwordHash = await hash(password, { type: 2 });
      await createUser(prisma, { email, displayName, passwordHash });
      console.log(`Created dev admin ${email} (password from SEED_ADMIN_PASSWORD)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
