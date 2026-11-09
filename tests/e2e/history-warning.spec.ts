import { test, expect } from '@playwright/test';
import { resolve } from 'path';

test('changing trace placement after undo raises no toast and no history notice', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const row = page.locator('[data-testid^="trace-row-"]').first();
  await row.getByTitle('Show in panes').click();
  const pane2 = row.getByRole('menuitemcheckbox', { name: 'Pane 2' });
  await pane2.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z'); // a Show in toggle raises no toast
  await row.getByTitle('Show in panes').click();
  await expect(pane2).not.toBeChecked();
  await pane2.click();
  await expect(pane2).toBeChecked();
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await expect(page.getByText(/history was removed to stay within the history limit/)).toHaveCount(0);
});
