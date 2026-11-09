import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('apply interpolation to a file is one undoable change', async ({ page }) => {
 await page.goto('/app.html');
 await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
 const rows = page.locator('[data-testid^="trace-row-"]');
 await rows.first().getByRole('button', { name: 'Lin', exact: true }).click();
 await page.getByRole('menuitemcheckbox', { name: /Previous/ }).click();
 await page.getByRole('button', { name: 'Apply to all traces from this file' }).click();
 await expect(rows.nth(1).getByRole('button', { name: 'Prev', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Undo' }).last().click();
 await expect(rows.nth(1).getByRole('button', { name: 'Lin', exact: true })).toBeVisible();
 await expect(rows.first().getByRole('button', { name: 'Prev', exact: true })).toBeVisible();
});


test('apply interpolation includes hidden file projections', async ({ page }) => {
 await page.goto('/app.html');
 await page.getByTestId('empty-chart-file-input').setInputFiles({ name: 'channels.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V),CH2 (V)\n0,1,2\n1,3,4\n2,5,6\n') });
 await page.getByRole('button', { name: 'Columns', exact: true }).click();
 const checks = page.locator('label').filter({ has: page.locator('input[type=checkbox]') }).filter({ hasText: /ch/i });
 await checks.nth(1).locator('input').uncheck();
 const row = page.locator('[data-testid^="trace-row-"]').first();
 await row.getByRole('button', { name: /Sinc|Lin|Exact/ }).click();
 await page.getByRole('menuitemcheckbox', { name: /Previous/ }).click();
 await page.getByRole('button', { name: 'Apply to all traces from this file' }).click();
 await checks.nth(1).locator('input').check();
 await expect(page.locator('[data-testid^="trace-row-"]').nth(1).getByRole('button', { name: 'Prev', exact: true })).toBeVisible();
});
