import { test, expect } from '@playwright/test';

const adminEmail = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@pbl.local';
const adminPassword = process.env['SEED_ADMIN_PASSWORD'] ?? 'pbl-dev-admin';
const csrfHeaders = { 'x-requested-with': 'pbl' };

test.describe('participant management', () => {
  test.skip(() => process.env['SKIP_E2E'] === '1', 'SKIP_E2E=1');

  test('admin searches and adds a player on session detail', async ({ page, context }) => {
    const login = await context.request.post('/api/auth/login', {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    expect(login.ok()).toBeTruthy();

    const playerRes = await context.request.post('/api/players', {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: { displayName: `E2E Player ${String(Date.now())}` },
    });
    expect(playerRes.ok()).toBeTruthy();
    const player = (await playerRes.json()) as { player: { id: string; displayName: string } };

    const sessionRes = await context.request.post('/api/sessions', {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: {
        title: `E2E Session ${String(Date.now())}`,
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        courtCount: 2,
        visibility: 'PUBLIC',
      },
    });
    expect(sessionRes.ok()).toBeTruthy();
    const session = (await sessionRes.json()) as { id: string; title: string };

    await page.goto(`/sessions/${session.id}`);
    await expect(page.getByRole('heading', { name: session.title })).toBeVisible();
    await expect(page.getByTestId('participant-manager')).toBeVisible();

    await page.getByTestId('player-search').fill(player.player.displayName.slice(0, 6));
    await page.getByRole('checkbox', { name: player.player.displayName }).check();
    await page.getByTestId('add-participants').click();
    await expect(page.getByTestId('participant-feedback')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`participant-${player.player.id}`)).toBeVisible();
  });
});
