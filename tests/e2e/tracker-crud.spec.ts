import { expect, test, type Page, type TestInfo } from '@playwright/test';

function navigation(page: Page, testInfo: TestInfo) {
  return testInfo.project.name === 'chromium-mobile'
    ? page.locator('#mobileNav')
    : page.locator('.sidebar');
}

test.describe('tracker and log workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?fixture=populated');
    await expect(page.locator('#app')).toBeVisible();
  });

  test('creates, edits, and deletes a tracker', async ({ page }, testInfo) => {
    await navigation(page, testInfo).getByRole('link', { name: /Trackers/ }).click();
    const trackerView = page.locator('#view-trackers');
    await trackerView.getByRole('button', { name: '+ New tracker' }).click();
    const createTrackerDialog = page.getByRole('dialog', { name: 'Create tracker' });
    await createTrackerDialog.getByLabel('Tracker name').fill('Meditation');
    await createTrackerDialog.getByLabel('Icon / emoji').fill('🧘');
    await createTrackerDialog.getByLabel('Unit').fill('minute');
    await createTrackerDialog
      .getByLabel('Quick values, separated by commas')
      .fill('5, 10');
    await createTrackerDialog.getByRole('button', { name: 'Save tracker' }).click();

    const tracker = trackerView.locator('.manage-card').filter({ hasText: 'Meditation' });
    await expect(tracker).toBeVisible();
    await tracker.getByRole('button', { name: 'Edit' }).click();
    const editTrackerDialog = page.getByRole('dialog', { name: 'Edit tracker' });
    await editTrackerDialog.getByLabel('Tracker name').fill('Mindfulness');
    await editTrackerDialog.getByRole('button', { name: 'Save tracker' }).click();
    await expect(trackerView.locator('#trackerManageList')).toContainText('Mindfulness');

    page.once('dialog', dialog => dialog.accept());
    await trackerView.locator('.manage-card')
      .filter({ hasText: 'Mindfulness' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(trackerView.locator('#trackerManageList')).not.toContainText('Mindfulness');
  });

  test('creates, edits, filters, and deletes a log', async ({ page }, testInfo) => {
    await page.locator('#view-dashboard')
      .getByRole('button', { name: 'Add manual record' })
      .click();
    const addLogDialog = page.getByRole('dialog', { name: 'Add record' });
    await addLogDialog.getByLabel('Tracker').selectOption('tracker-water');
    await addLogDialog.getByLabel('Value').fill('3');
    await addLogDialog.getByLabel('Note (optional)').fill('Gym bottle');
    await addLogDialog.getByRole('button', { name: 'Save record' }).click();
    await expect(addLogDialog).toBeHidden();

    await navigation(page, testInfo).getByRole('link', { name: /History/ }).click();
    const historyView = page.locator('#view-history');
    await historyView.getByLabel('Search note').fill('Gym bottle');
    const row = historyView.locator('.activity-row').filter({ hasText: 'Gym bottle' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Edit record' }).click();
    const editLogDialog = page.getByRole('dialog', { name: 'Edit record' });
    await editLogDialog.getByLabel('Note (optional)').fill('Large gym bottle');
    await editLogDialog.getByRole('button', { name: 'Save record' }).click();
    await expect(editLogDialog).toBeHidden();
    await expect(historyView.locator('#historyGroups')).toContainText('Large gym bottle');

    page.once('dialog', dialog => dialog.accept());
    await historyView.locator('.activity-row')
      .filter({ hasText: 'Large gym bottle' })
      .getByRole('button', { name: 'Delete record' })
      .click();
    await expect(historyView.locator('#historyGroups')).not.toContainText('Large gym bottle');
  });

  test('creates a one-option tracker, edits its quick log, and locks its type', async ({
    page
  }, testInfo) => {
    await navigation(page, testInfo).getByRole('link', { name: /Trackers/ }).click();
    const trackerView = page.locator('#view-trackers');
    await trackerView.getByRole('button', { name: '+ New tracker' }).click();
    const createTrackerDialog = page.getByRole('dialog', { name: 'Create tracker' });
    await createTrackerDialog.getByLabel('Tracker name').fill('Bedtime');
    await createTrackerDialog.getByLabel('Tracking type').selectOption('option');
    await createTrackerDialog
      .getByLabel('Options, separated by commas')
      .fill('Wake');
    await createTrackerDialog.getByRole('button', { name: 'Save tracker' }).click();

    const managedTracker = trackerView.locator('.manage-card').filter({ hasText: 'Bedtime' });
    await expect(managedTracker).toContainText('Options: Wake');

    await navigation(page, testInfo).locator('[data-nav="dashboard"]').click();
    const trackerCard = page.locator('.tracker-card').filter({ hasText: 'Bedtime' });
    await trackerCard.locator('[data-option-id]').filter({ hasText: 'Wake' }).click();
    await expect(page.locator('#toastMessage')).toContainText('Bedtime: Wake recorded');

    await navigation(page, testInfo).getByRole('link', { name: /History/ }).click();
    const historyView = page.locator('#view-history');
    const row = historyView.locator('.activity-row').filter({ hasText: 'Bedtime' });
    await expect(row).toContainText('Wake');
    await row.getByRole('button', { name: 'Edit record' }).click();
    const editLogDialog = page.getByRole('dialog', { name: 'Edit record' });
    await editLogDialog.getByLabel('Date and time').fill('2026-07-20T21:45');
    await editLogDialog.getByLabel('Note (optional)').fill('Ready for bed');
    await editLogDialog.getByRole('button', { name: 'Save record' }).click();

    const expectedTimestamp = await page.evaluate(() => new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date('2026-07-20T21:45')));
    await expect(row).toContainText(expectedTimestamp);
    await expect(row).toContainText('Ready for bed');

    await navigation(page, testInfo).getByRole('link', { name: /Trackers/ }).click();
    await managedTracker.getByRole('button', { name: 'Edit' }).click();
    const editTrackerDialog = page.getByRole('dialog', { name: 'Edit tracker' });
    await expect(editTrackerDialog.getByLabel('Tracking type')).toBeDisabled();
    await expect(editTrackerDialog).toContainText(
      'Tracking type cannot change after records exist.'
    );
  });

  test('creates, renames, and reorders an Option before confirmed removal cascades its log', async ({
    page
  }, testInfo) => {
    await navigation(page, testInfo).getByRole('link', { name: /Trackers/ }).click();
    const trackerView = page.locator('#view-trackers');
    await trackerView.getByRole('button', { name: '+ New tracker' }).click();
    const createTrackerDialog = page.getByRole('dialog', { name: 'Create tracker' });
    await createTrackerDialog.getByLabel('Tracker name').fill('Routine');
    await createTrackerDialog.getByLabel('Tracking type').selectOption('option');
    await createTrackerDialog.getByLabel('Options, separated by commas').fill('Sleep, Wake');
    await createTrackerDialog.getByRole('button', { name: 'Save tracker' }).click();

    await navigation(page, testInfo).locator('[data-nav="dashboard"]').click();
    const trackerCard = page.locator('.tracker-card').filter({ hasText: 'Routine' });
    await trackerCard.locator('[data-option-id]').filter({ hasText: 'Wake' }).click();

    await navigation(page, testInfo).getByRole('link', { name: /History/ }).click();
    const historyView = page.locator('#view-history');
    const row = historyView.locator('.activity-row').filter({ hasText: 'Routine' });
    await expect(row).toContainText('Wake');

    await navigation(page, testInfo).getByRole('link', { name: /Trackers/ }).click();
    const managedTracker = trackerView.locator('.manage-card').filter({ hasText: 'Routine' });
    await managedTracker.getByRole('button', { name: 'Edit' }).click();
    let editTrackerDialog = page.getByRole('dialog', { name: 'Edit tracker' });
    await editTrackerDialog
      .getByLabel('Options, separated by commas')
      .fill('Sleep, Awake');
    await editTrackerDialog.getByRole('button', { name: 'Save tracker' }).click();
    await expect(row).toContainText('Awake');

    await managedTracker.getByRole('button', { name: 'Edit' }).click();
    editTrackerDialog = page.getByRole('dialog', { name: 'Edit tracker' });
    await editTrackerDialog
      .getByLabel('Options, separated by commas')
      .fill('Awake, Sleep');
    await editTrackerDialog.getByRole('button', { name: 'Save tracker' }).click();
    await expect(managedTracker).toContainText('Options: Awake, Sleep');
    await expect(row).toContainText('Awake');

    await managedTracker.getByRole('button', { name: 'Edit' }).click();
    editTrackerDialog = page.getByRole('dialog', { name: 'Edit tracker' });
    await editTrackerDialog.getByLabel('Options, separated by commas').fill('Sleep');
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Remove Awake and delete 1 associated records?');
      await dialog.accept();
    });
    await editTrackerDialog.getByRole('button', { name: 'Save tracker' }).click();
    await expect(editTrackerDialog).toBeHidden();

    await navigation(page, testInfo).getByRole('link', { name: /History/ }).click();
    await expect(historyView.locator('.activity-row').filter({ hasText: 'Routine' }))
      .toHaveCount(0);
  });
});
