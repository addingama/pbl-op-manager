import { test, expect } from '@playwright/test';

test.describe('public smoke', () => {
  test('home navigates to open play list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await page.getByRole('link', { name: 'View open play list' }).click();
    await expect(page.getByRole('heading', { name: 'Open Play' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
});
