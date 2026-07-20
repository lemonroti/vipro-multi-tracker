import { expect, test } from '@playwright/test';

test('desktop navigation changes views and persists a dark theme', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop-only layout assertion');
  await page.goto('/?runtime=typed&fixture=populated');

  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('#mobileNav')).toBeHidden();
  await page.locator('.sidebar').getByRole('link', { name: 'Settings' }).click();
  await expect(page.locator('#view-settings')).toBeVisible();
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('mobile navigation changes views without showing the desktop sidebar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile-only layout assertion');
  await page.goto('/?runtime=typed&fixture=populated');

  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('#mobileNav')).toBeVisible();
  await page.locator('#mobileNav').getByRole('link', { name: 'History' }).click();
  await expect(page.locator('#view-history')).toBeVisible();
  await expect(page.locator('#pageTitle')).toHaveText('History');
});
