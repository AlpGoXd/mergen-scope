import { test, expect } from '@playwright/test';
import { resolve } from 'path';

test('new two-port files open the matrix and expose ABCD', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  const matrix = page.getByRole('button', { name: 'Matrix', exact: true });
  await expect(matrix).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'ABCD', exact: true }).click();
  await page.getByTestId('touchstone-cell-ABCD11').click();
  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'ABCD11' })).toBeVisible();
  await matrix.click();
  await expect(matrix).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'ABCD', exact: true })).toHaveCount(0);
});
