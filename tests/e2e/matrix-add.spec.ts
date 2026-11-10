import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('matrix cells add views and identify duplicates', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  const cell = page.getByTestId('touchstone-cell-S11');
  const rows = page.locator('[data-testid^="trace-row-"]');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  await cell.click();
  await expect(rows).toHaveCount(before);
  await expect(page.locator('.matrix-highlight')).toBeVisible();
  await page.getByRole('button', { name: 'Mag', exact: true }).click();
  await cell.click();
  await expect(rows).toHaveCount(before + 1);
  await expect(cell.locator('.lp-cell__count')).toHaveText('2');
  await cell.hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'S11 · Mag' })).toBeVisible();
});
