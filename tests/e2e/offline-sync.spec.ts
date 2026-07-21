import { expect, test } from '@playwright/test';

test('keeps pending work offline and drains it after reconnecting', async ({ context, page }) => {
  await context.addInitScript(() => {
    let online = false;
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => online
    });
    Object.defineProperty(window, '__setFixtureOnline', {
      value: (value: boolean) => {
        online = value;
      }
    });
  });
  await page.goto('/?fixture=offline-pending');

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#offlineBanner')).toBeVisible();
  await expect(page.locator('#syncBadgeText')).toHaveText('Offline');
  await expect(page.locator('#dashboardActivity')).toContainText('Queued while offline');

  await page.locator('#dashboardTrackerGrid')
    .getByRole('button', { name: '+1' })
    .first()
    .click();
  await expect(page.locator('#toastMessage')).toContainText('offline');

  await page.evaluate(() => {
    const fixtureWindow = window as typeof window & {
      __setFixtureOnline(value: boolean): void;
    };
    fixtureWindow.__setFixtureOnline(true);
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.locator('#offlineBanner')).toBeHidden();
  await expect(page.locator('#syncBadgeText')).toHaveText('Synced');
});
