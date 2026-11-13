import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('renaming a file updates its automatic trace labels in one undo step', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  const traces = page.locator('[data-testid^="trace-row-"]');
  await expect(traces.first()).toContainText('cascaded chain.s2p');
  await page.getByRole('button', { name: 'Actions for cascaded chain.s2p' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'File name' });
  await name.fill('renamed.s2p');
  await name.press('Enter');
  await expect(traces.first()).toContainText('renamed.s2p');
  await page.keyboard.press('Control+z');
  await expect(traces.first()).toContainText('cascaded chain.s2p');
});
