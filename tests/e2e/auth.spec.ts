import { expect, test } from '@playwright/test';

test.describe('authentication visibility', () => {
  test('shows signed-out UI then activates the real application after sign in', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1') externalRequests.push(request.url());
    });

    await page.goto('/?fixture=signed-out');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();

    await page.getByLabel('Email').fill('browser@example.test');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#authScreen')).toBeHidden();
    await expect(page.locator('#accountEmail')).toHaveText('browser@example.test');
    expect(externalRequests).toEqual([]);
  });

  test('loads an empty account through the real default-seeding flow', async ({ page }) => {
    await page.goto('/?fixture=signed-in-empty');

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#statActiveTrackers')).toHaveText('2');
    await expect(page.locator('#dashboardTrackerGrid')).toContainText('Smoking');
  });

  test('shows a safe startup message for repository failures', async ({ page }) => {
    await page.goto('/?fixture=repository-error');

    await expect(page.locator('#authScreen')).toBeVisible();
    await expect(page.locator('#authMessage')).toHaveText(
      'Could not restore your session. Please sign in again.'
    );
  });
});
