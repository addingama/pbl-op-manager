import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const keyPages = [
  { path: '/', name: 'home' },
  { path: '/sessions', name: 'sessions' },
  { path: '/leaderboard', name: 'leaderboard' },
  { path: '/login', name: 'login' },
] as const;

test.describe('accessibility', () => {
  test.skip(() => process.env['SKIP_E2E'] === '1', 'SKIP_E2E=1');

  for (const pageSpec of keyPages) {
    test(`axe: ${pageSpec.name}`, async ({ page }) => {
      await page.goto(pageSpec.path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }
});
