import { expect, test, type Page, type TestInfo } from '@playwright/test';

function navigation(page: Page, testInfo: TestInfo) {
  return testInfo.project.name === 'chromium-mobile'
    ? page.locator('#mobileNav')
    : page.locator('.sidebar');
}

test.describe('tracker and log workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?runtime=typed&fixture=populated');
    await expect(page.locator('#app')).toBeVisible();
  });

  test('creates, edits, and deletes a tracker', async ({ page }, testInfo) => {
    await navigation(page, testInfo).getByRole('link', { name: /Trackers/ }).click();
    await page.getByRole('button', { name: '+ New tracker' }).click();
    await page.getByLabel('Tracker name').fill('Meditation');
    await page.getByLabel('Icon / emoji').fill('🧘');
    await page.getByLabel('Unit').fill('minute');
    await page.getByLabel('Quick values, separated by commas').fill('5, 10');
    await page.getByRole('button', { name: 'Save tracker' }).click();

    const tracker = page.locator('#trackerManageList .manage-card').filter({ hasText: 'Meditation' });
    await expect(tracker).toBeVisible();
    await tracker.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Tracker name').fill('Mindfulness');
    await page.getByRole('button', { name: 'Save tracker' }).click();
    await expect(page.locator('#trackerManageList')).toContainText('Mindfulness');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#trackerManageList .manage-card')
      .filter({ hasText: 'Mindfulness' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.locator('#trackerManageList')).not.toContainText('Mindfulness');
  });

  test('creates, edits, filters, and deletes a log', async ({ page }, testInfo) => {
    await page.getByRole('button', { name: 'Add manual record' }).click();
    await page.getByLabel('Tracker').selectOption('tracker-water');
    await page.getByLabel('Value').fill('3');
    await page.getByLabel('Note (optional)').fill('Gym bottle');
    await page.getByRole('button', { name: 'Save record' }).click();

    await navigation(page, testInfo).getByRole('link', { name: /History/ }).click();
    await page.getByLabel('Search note').fill('Gym bottle');
    const row = page.locator('#historyGroups .activity-row').filter({ hasText: 'Gym bottle' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Note (optional)').fill('Large gym bottle');
    await page.getByRole('button', { name: 'Save record' }).click();
    await expect(page.locator('#historyGroups')).toContainText('Large gym bottle');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#historyGroups .activity-row')
      .filter({ hasText: 'Large gym bottle' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.locator('#historyGroups')).not.toContainText('Large gym bottle');
  });
});
