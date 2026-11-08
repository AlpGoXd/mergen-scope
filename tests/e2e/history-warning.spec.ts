import { test, expect } from '@playwright/test';
import { resolve } from 'path';

test('changing trace placement after undo does not claim undo history reached its limit', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const row = page.locator('[data-testid^="trace-row-"]').first();
  await row.getByTitle('Show in panes').click();
  const pane2 = row.getByRole('checkbox', { name: 'Pane 2' });
  await pane2.check();
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(pane2).not.toBeChecked();
  await pane2.check();
  await expect(pane2).toBeChecked();
  await expect(page.getByText('Updated trace panes')).toBeVisible();
  await expect(page.getByText(/history was removed to stay within the history limit/)).toHaveCount(0);
});
