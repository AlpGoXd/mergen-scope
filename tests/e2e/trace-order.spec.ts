import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis } from './analysis-helpers';

test('a smooth trace appears immediately below its first-file parent', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  const rows = page.locator('[data-testid^="trace-row-"]');
  const parentId = await rows.first().getAttribute('data-testid');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(rows.filter({ hasText: 'S21' }).first()).toBeVisible();
  const count = await rows.count();
  const card = await addAnalysis(page, 'Smooth');
  await card.locator('.an-select').first().click();
  await page.getByRole('menu', { name: 'Trace', exact: true }).getByRole('menuitemcheckbox').first().click();
  await card.getByRole('button', { name: 'Create trace' }).click();
  await expect(rows).toHaveCount(count + 1);
  await expect(rows.first()).toHaveAttribute('data-testid', parentId ?? '');
  await expect(rows.nth(1).locator('.lp-trace__child')).toBeVisible();
  await expect(rows.nth(1).locator('.lp-trace__fx')).toHaveText('ƒ');
});
