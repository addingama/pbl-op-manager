import { test, expect } from '@playwright/test';

const adminEmail = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@pbl.local';
const adminPassword = process.env['SEED_ADMIN_PASSWORD'] ?? 'pbl-dev-admin';
const csrfHeaders = { 'x-requested-with': 'pbl' };

test.describe('leaderboard', () => {
  test.skip(() => process.env['SKIP_E2E'] === '1', 'SKIP_E2E=1');

  test('updates after a confirmed match', async ({ page, context }) => {
    const login = await context.request.post('/api/auth/login', {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: { email: adminEmail, password: adminPassword },
    });
    expect(login.ok()).toBeTruthy();

    const stamp = String(Date.now());
    const playerIds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const playerRes = await context.request.post('/api/players', {
        headers: { ...csrfHeaders, 'content-type': 'application/json' },
        data: { displayName: `LB E2E P${String(i)}-${stamp}` },
      });
      expect(playerRes.ok()).toBeTruthy();
      const body = (await playerRes.json()) as { player: { id: string } };
      playerIds.push(body.player.id);
    }
    const sessionRes = await context.request.post('/api/sessions', {
      headers: { ...csrfHeaders, 'content-type': 'application/json' },
      data: {
        title: `LB E2E ${stamp}`,
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
    await page.getByTestId('confirm-sheet-submit').click();
    await expect(page.getByTestId('confirm-result-sheet')).toBeHidden({ timeout: 15_000 });

    await page.goto('/leaderboard?tab=provisional');
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    await expect(page.getByTestId('leaderboard-list')).toBeVisible();

    const winnerLink = page.getByTestId('leaderboard-entry').filter({ hasText: stamp });
    await expect(winnerLink.first()).toBeVisible({ timeout: 15_000 });

    await winnerLink.first().click();
    await expect(page.getByTestId('player-name')).toBeVisible();
    await expect(page.getByTestId('rating-history-chart')).toBeVisible();
    await expect(page).toHaveURL(/\/players\//);
  });
});
