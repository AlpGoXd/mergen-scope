import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis } from './analysis-helpers';

test('mixed spectrum and network trace math creates one trace', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  const rows = page.locator('[data-testid^="trace-row-"]');
  await expect(rows.filter({ hasText: 'S21' }).first()).toBeVisible();
  const count = await rows.count();
  const card = await addAnalysis(page, 'Trace math');
  await card.locator('.an-select').first().click();
  await page.getByRole('menu', { name: 'Trace', exact: true }).getByRole('menuitemcheckbox').first().click();
  await card.locator('.an-select').nth(1).click();
  await page.getByRole('menu', { name: 'Trace B' }).getByRole('menuitemcheckbox', { name: /S21/ }).first().click();
  await card.getByText('Choose…').first().click();
  await page.getByRole('menu', { name: 'Points' }).getByRole('menuitemcheckbox', { name: "A's" }).click();
  await card.getByText('Choose…').click();
  await page.getByRole('menu', { name: 'Fill gaps' }).getByRole('menuitemcheckbox', { name: 'Linear' }).click();
  await card.getByRole('button', { name: 'Create trace' }).click();
  await expect(rows).toHaveCount(count + 1);
});

test('time and frequency inputs explain why creation is disabled', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await page.getByTestId('app-open-input').setInputFiles({ name: 'time.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.001,2\n0.002,3\n') });
  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'time.csv' })).toBeVisible();
  const card = await addAnalysis(page, 'Trace math');
  await card.locator('.an-select').first().click();
  await page.getByRole('menu', { name: 'Trace', exact: true }).getByRole('menuitemcheckbox').first().click();
  await card.locator('.an-select').nth(1).click();
  await page.getByRole('menu', { name: 'Trace B' }).getByRole('menuitemcheckbox', { name: /time.csv/i }).first().click();
  await expect(card.getByRole('button', { name: 'Create trace' })).toBeDisabled();
  await expect(card).toContainText('Cannot combine a time trace (s) with a frequency trace (Hz).');
});
