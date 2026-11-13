import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('file card controls and typography reflect the reference', async ({ page }) => {
  await page.goto('/app.html');
  // No file yet: the Files header has no Open\u2026 of its own; the drop area's Open\u2026 does the job.
  const filesHead = page.locator('section.lp-section[aria-label="Files"] .lp-head');
  await expect(filesHead.getByRole('button', { name: 'Open\u2026', exact: true })).toHaveCount(0);
  const open = page.locator('.lp-drop').getByRole('button', { name: 'Open\u2026', exact: true });
  await expect(open).toBeEnabled();
  await expect(page.locator('.lp-drop').getByRole('button', { name: 'Load demo' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await open.click();
  await (await chooser).setFiles(resolve('test files/cascaded chain.s2p'));
  await expect(filesHead.getByRole('button', { name: 'Open\u2026', exact: true })).toBeVisible();
  const name = page.locator('span[title^="cascaded chain.s2p"]').first();
  await expect(name).toHaveCSS('font-weight', '600');
  await expect(name).toHaveCSS('font-family', '"IBM Plex Sans", sans-serif');
  await expect(name).toHaveCSS('font-feature-settings', '"ss02"');
  await expect(name.locator('../..')).toContainText('10 kHz\u20138.5 GHz \u00b7 2\u00a0traces');
  await expect(name.locator('..').getByTitle('Remove file', { exact: true })).toHaveText('\u00d7');
  await page.getByRole('button', { name: 'Actions for cascaded chain.s2p' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveText(['Info', 'Replace file\u2026', 'Rename', 'Show all', 'Hide all', 'Remove file\u2026']);
  await expect(menu.getByRole('menuitem', { name: 'Replace file\u2026' })).toHaveAttribute('aria-disabled', 'true');
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeEnabled();
  await expect(page.getByTestId('touchstone-cell-S11')).toHaveCSS('font-family', '"JetBrains Mono", monospace');
  await page.getByRole('button', { name: 'More network views' }).focus();
  await page.getByRole('button', { name: 'More network views' }).press('Enter');
  await page.getByRole('menuitem', { name: 'Group delay' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'More network views' })).toHaveAttribute('aria-expanded', 'false');
});
