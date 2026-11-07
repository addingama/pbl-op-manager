import { hash } from 'argon2';
import { createPrismaClient, loadRootEnv } from '@pbl/database';
import { createUser, findUserByEmail } from '../modules/auth/repo.js';

loadRootEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const email = (arg('email') ?? process.env['CREATE_ADMIN_EMAIL'] ?? '').trim().toLowerCase();
const password = arg('password') ?? process.env['CREATE_ADMIN_PASSWORD'] ?? '';
const displayName = arg('name') ?? process.env['CREATE_ADMIN_NAME'] ?? 'Admin';

if (email === '' || password === '') {
  console.error(
    'Usage: create-admin --email <email> --password <password> [--name "Display Name"]\n' +
      'Or set CREATE_ADMIN_EMAIL and CREATE_ADMIN_PASSWORD.',
  );
  process.exitCode = 1;
} else {
  const prisma = createPrismaClient();
  try {
    const existing = await findUserByEmail(prisma, email);
    if (existing !== null) {
      console.error(`Admin already exists: ${email}`);
      process.exitCode = 1;
    } else {
      const passwordHash = await hash(password, { type: 2 });
      const user = await createUser(prisma, { email, displayName, passwordHash });
      console.log(`Created admin ${user.email} (${user.id})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
