import { test, expect } from '@playwright/test';

const adminEmail = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@pbl.local';
const adminPassword = process.env['SEED_ADMIN_PASSWORD'] ?? 'pbl-dev-admin';
const csrfHeaders = { 'x-requested-with': 'pbl' };

test.describe('live manager flow', () => {
  test.skip(() => process.env['SKIP_E2E'] === '1', 'SKIP_E2E=1');

  test('generate round, start, pick winner, confirm', async ({ page, context }) => {
    const login = await context.request.post('/api/auth/login', {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    expect(login.ok()).toBeTruthy();

    const playerIds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const playerRes = await context.request.post('/api/players', {
        headers: { ...csrfHeaders, 'content-type': 'application/json' },
        data: { displayName: `Live P${String(i)}-${String(Date.now())}` },
      });
      expect(playerRes.ok()).toBeTruthy();
      const body = (await playerRes.json()) as { player: { id: string } };
      playerIds.push(body.player.id);
    }

    const sessionRes = await context.request.post('/api/sessions', {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: {
        title: `Live E2E ${String(Date.now())}`,
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        courtCount: 2,
        visibility: 'PUBLIC',
      },
    });
    expect(sessionRes.ok()).toBeTruthy();
    const session = (await sessionRes.json()) as { id: string };

    await context.request.patch(`/api/sessions/${session.id}`, {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: { status: 'OPEN' },
    });

    await context.request.post(`/api/sessions/${session.id}/participants`, {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: { playerIds },
    });

    await page.goto(`/sessions/${session.id}/generator`);
    await page.getByTestId('generate-round').click();
    await expect(page.getByTestId('live-round-manager')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('start-round').click();
    await page.getByRole('button', { name: 'Team 1' }).first().click();
    await expect(page.getByTestId('confirm-result-sheet')).toBeVisible();
    await page.getByTestId('confirm-sheet-submit').click();
    await expect(page.getByTestId('confirm-result-sheet')).toBeHidden({ timeout: 15_000 });
  });
});
