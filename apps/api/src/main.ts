import { loadRootEnv } from '@pbl/database';
import { buildServer } from './server.js';

loadRootEnv();

const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '127.0.0.1';

const app = await buildServer();
try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
