import { expect, test } from '@playwright/test';

test('desktop navigation changes views and persists a dark theme', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop-only layout assertion');
  await page.goto('/?fixture=populated');

  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('#mobileNav')).toBeHidden();
  await expect(page.locator('#headerAction')).toBeVisible();
  await expect(page.locator('.sidebar svg[data-lucide="house"]')).toBeVisible();
  await expect.poll(async () => page.locator('body').evaluate(element => (
    getComputedStyle(element).fontFamily
  ))).toContain('Geist Variable');
  expect(await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Geist Variable"');
  })).toBe(true);
  await page.locator('.sidebar').getByRole('link', { name: 'Settings' }).click();
  await expect(page.locator('#view-settings')).toBeVisible();
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('mobile navigation changes views without showing the desktop sidebar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile-only layout assertion');
  await page.goto('/?fixture=populated');

  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('#mobileNav')).toBeVisible();
  await expect(page.locator('#headerAction')).toBeVisible();
  await expect(page.locator('#mobileNav svg[data-lucide="house"]')).toBeVisible();
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);

  await page.locator('[data-custom-log="tracker-sleep"]').click();
  await expect(page.getByRole('dialog', { name: 'Add record' }).getByLabel('Option', {
    exact: true
  }))
    .toBeVisible();
  expect(await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const optionButtons = [...document.querySelectorAll<HTMLElement>('[data-option-id]')];
    const modal = document.querySelector<HTMLElement>('#logModal .modal');
    const optionField = document.querySelector<HTMLElement>('#logOptionField');
    return {
      optionButtonsFit: optionButtons.every(button => {
        const bounds = button.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= viewportWidth;
      }),
      modalFits: modal !== null && modal.scrollWidth <= modal.clientWidth,
      optionFieldFits: optionField !== null
        && optionField.scrollWidth <= optionField.clientWidth
    };
  })).toEqual({
    optionButtonsFit: true,
    modalFits: true,
    optionFieldFits: true
  });
  await page.getByRole('button', { name: 'Close record dialog' }).click();

  await page.locator('#mobileNav').getByRole('link', { name: 'History' }).click();
  await expect(page.locator('#view-history')).toBeVisible();
  await expect(page.locator('#pageTitle')).toHaveText('History');
});
