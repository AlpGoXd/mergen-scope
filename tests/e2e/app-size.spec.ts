import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'App settings' })).toBeVisible();
}

async function chooseSize(page: Page, name: 'Compact' | 'Comfortable' | 'Large') {
  const sheet = page.getByRole('dialog', { name: 'App settings' });
  await sheet.getByRole('group', { name: 'Size' }).getByRole('button', { name, exact: true }).click();
}

test('size defaults to Comfortable, persists across reloads and resets', async ({ page }) => {
  await page.goto('/app.html');
  await expect(page.locator('html')).toHaveAttribute('data-size', 'comfortable');
  await openSettings(page);
  await chooseSize(page, 'Large');
  await expect(page.locator('html')).toHaveAttribute('data-size', 'large');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--control-height').trim())).toBe('32px');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-size', 'large');
  await openSettings(page);
  await chooseSize(page, 'Compact');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-size', 'compact');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--row-height').trim())).toBe('26px');
  await openSettings(page);
  await page.getByRole('button', { name: 'Reset all to defaults' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-size', 'comfortable');
});
