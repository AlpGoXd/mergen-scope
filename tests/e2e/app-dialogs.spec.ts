import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { answerAppDialog, appDialog } from './workspace-helpers';

const S2P = resolve('test files/cascaded chain.s2p');
const DAT = resolve('test files/cascade_ip3_-12dBm.DAT');

async function expectCentred(page: Page) {
  const box = await appDialog(page).boundingBox();
  const view = page.viewportSize();
  if (!box || !view) throw new Error('no box');
  expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - view.height / 2)).toBeLessThan(3);
}

test.beforeEach(async ({ page }) => {
  // No browser dialog may appear: fail the test if one does.
  page.on('dialog', dialog => { throw new Error(`Browser dialog: ${dialog.message()}`); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/app.html');
});

test('a same-name file asks in the app dialog: Esc cancels, Add as a new file keeps both, Replace swaps', async ({ page }) => {
  const input = page.getByTestId('app-open-input');
  await input.setInputFiles(S2P);
  await expect(page.locator('.lp-file')).toHaveCount(1);
  await input.setInputFiles(S2P);
  const dialog = appDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('cascaded chain.s2p is already open.');
  await expect(dialog).toContainText('markers on anything it no longer has are removed');
  await expectCentred(page);
  // One solid confirm: Replace.
  await expect(dialog.locator('.ui-btn--solid')).toHaveText('Replace');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.lp-file')).toHaveCount(1);

  await input.setInputFiles(S2P);
  await answerAppDialog(page, 'Add as a new file');
  await expect(page.locator('.lp-file')).toHaveCount(2);
  await expect(page.locator('.lp-file').nth(1)).toContainText('cascaded chain.s2p (2)');

  await input.setInputFiles(S2P);
  await answerAppDialog(page, 'Replace');
  await expect(page.locator('.lp-file')).toHaveCount(2);
});

test('removing a file or a trace with markers says what goes with it', async ({ page }) => {
  await page.getByTestId('app-open-input').setInputFiles(DAT);
  const plot = page.locator('[data-testid^="chart-plot-"]').first();
  await plot.click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('n');
  await plot.click({ position: { x: 300, y: 150 } });
  await expect(page.getByTestId('marker-row-1')).toBeVisible();

  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await trace.getByRole('button', { name: /^Remove / }).click();
  const text = await answerAppDialog(page, 'Cancel');
  expect(text).toContain('Its 1 marker is removed with it. You can undo this.');
  await expect(trace).toBeVisible();

  await page.locator('.lp-file').first().getByTitle('Remove file').click();
  await expect(appDialog(page)).toContainText('Its 1 trace and 1 marker are removed with it.');
  await expect(appDialog(page).locator('.ui-btn--solid')).toHaveText('Remove file');
  await answerAppDialog(page, 'Remove file');
  await expect(page.locator('.lp-file')).toHaveCount(0);
});

test('opening a workspace over open work asks in the app dialog', async ({ page }) => {
  await page.getByTestId('app-open-input').setInputFiles(DAT);
  await expect(page.locator('.lp-file')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error('no workspace');
  await page.getByTestId('topbar-workspace-input').setInputFiles(path);
  await expect(appDialog(page).getByRole('heading')).toHaveText('Replace the current workspace?');
  await expect(appDialog(page)).toContainText('closes the open file and its traces');
  await expectCentred(page);
  await answerAppDialog(page, 'Replace');
  await expect(page.locator('.lp-file')).toHaveCount(1);
});
