import { test, expect } from '@playwright/test';

test.describe('pwa', () => {
  test.skip(() => process.env['SKIP_E2E'] === '1', 'SKIP_E2E=1');

  test('manifest and service worker registration', async ({ page }) => {
    await page.goto('/');
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);

    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return reg.scope.includes(window.location.origin);
    });
    expect(swReady).toBe(true);
  });

  test('offline banner when browser is offline', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
    await context.setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await context.setOffline(false);
  });
});
