import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('network matrix and info remain open together', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByRole('button', { name: 'Actions for cascaded chain.s2p' }).click();
  await page.getByRole('menuitem', { name: 'Info', exact: true }).click();
  await expect(page.getByTestId('touchstone-cell-S11')).toBeVisible();
  await expect(page.getByText('Port Count', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Matrix', exact: true }).click();
  await expect(page.getByTestId('touchstone-cell-S11')).toBeHidden();
  await expect(page.getByText('Port Count', { exact: true })).toBeVisible();
});

test('multi-column CSV exposes individual column toggles', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'channels.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V),CH2 (V)\n0,1,2\n1,3,4\n2,5,6\n') });
  const columns = page.getByRole('button', { name: 'Columns', exact: true });
  await expect(columns).toBeVisible();
  await columns.click();
  const checks = page.locator('label').filter({ has: page.locator('input[type=checkbox]') }).filter({ hasText: /ch/i });
  await expect(checks).toHaveCount(2);
  await checks.first().locator('input').uncheck();
  await expect(checks.first()).toContainText('not plotted');
  await checks.first().locator('input').check();
});

