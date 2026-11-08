import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('file card controls and typography reflect the reference', async ({ page }) => {
  await page.goto('/app.html');
  const open = page.getByRole('button', { name: 'Open\u2026', exact: true }).first();
  await expect(open).toBeEnabled();
  const chooser = page.waitForEvent('filechooser');
  await open.click();
  await (await chooser).setFiles(resolve('test files/cascaded chain.s2p'));
  const name = page.locator('span[title^="cascaded chain.s2p"]').first();
  await expect(name).toHaveCSS('font-weight', '600');
  await expect(name).toHaveCSS('font-family', '"IBM Plex Sans", sans-serif');
  await expect(name).toHaveCSS('font-feature-settings', '"ss02"');
  await expect(name.locator('..')).toContainText('10 kHz\u20138.5 GHz \u00b7 2\u00a0traces');
  await expect(name.locator('..').getByTitle('Remove file', { exact: true })).toHaveText('\u00d7');
  await page.getByLabel('Actions for cascaded chain.s2p').click();
  const menu = page.getByLabel('Actions for cascaded chain.s2p').locator('..');
  await expect(menu.locator('button')).toHaveText(['Info', 'Replace file\u2026', 'Rename', 'Show all', 'Hide all', 'Remove file\u2026']);
  await expect(menu.getByRole('button', { name: 'Replace file\u2026' })).toBeDisabled();
  await expect(menu.getByRole('button', { name: 'Rename' })).toBeDisabled();
  await expect(page.getByLabel('More network views')).toHaveValue('');
  await expect(page.getByTestId('touchstone-cell-S11')).toHaveCSS('font-family', '"JetBrains Mono", monospace');
  await page.getByLabel('More network views').focus();
  await page.getByLabel('More network views').press('End');
  await expect(page.getByLabel('More network views')).toHaveValue('Group delay');
});
