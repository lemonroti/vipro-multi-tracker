import { expect, test } from '@playwright/test';

test('keeps an Option log through an offline reload and drains it after reconnecting', async ({
  context,
  page
}) => {
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

  await page.locator('[data-option-id="option-wake"]').click();
  await expect(page.locator('#toastMessage')).toContainText('offline');
  const optionRow = page.locator('#dashboardActivity .activity-row')
    .filter({ hasText: 'Sleep Tracker' });
  await expect(optionRow).toContainText('Wake');

  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#offlineBanner')).toBeVisible();
  await expect(page.locator('#dashboardActivity .activity-row').filter({ hasText: 'Sleep Tracker' }))
    .toContainText('Wake');

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
