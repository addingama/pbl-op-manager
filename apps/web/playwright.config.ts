import { defineConfig } from '@playwright/test';

const skip = process.env['SKIP_E2E'] === '1';

const webServers = [
  {
    command: 'pnpm --filter @pbl/api start',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  {
    command: 'pnpm --filter @pbl/web dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
] as const;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  ...(skip ? {} : { webServer: [...webServers] }),
});
