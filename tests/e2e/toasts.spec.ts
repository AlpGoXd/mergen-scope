import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

async function loaded(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  // Opening a file raises the "Opened 1 file" toast; dismiss it so the rest starts from a clean screen.
  await expect(page.locator('.ui-toast')).toContainText('Opened 1 file');
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(page.locator('.ui-toast')).toHaveCount(0);
}

test('placing and moving markers and lines, toggles, Undo and Redo raise no toast', async ({ page }) => {
  await loaded(page);
  const plot = page.getByTestId('chart-plot-pane-1');
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  await plot.click({ position: { x: 300, y: 120 } });
  await page.getByRole('button', { name: 'V-Line' }).click();
  await plot.click({ position: { x: 260, y: 60 } });
  await page.getByRole('button', { name: 'H-Line' }).click();
  await plot.click({ position: { x: 260, y: 90 } });
  // Move the V line, toggle a trace's visibility, undo, redo.
  const box = await plot.locator('.ln-label').first().boundingBox();
  if (!box) throw new Error('no label');
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + 120, { steps: 5 });
  await page.mouse.up();
  await page.locator('[data-testid^="trace-row-"]').first().getByRole('checkbox').click();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.ui-toast')).toHaveCount(0);
});

test('deleting raises one toast at bottom centre that replaces the last one and offers Undo', async ({ page }) => {
  await loaded(page);
  const plot = page.getByTestId('chart-plot-pane-1');
  await page.getByRole('button', { name: 'V-Line' }).click();
  await plot.click({ position: { x: 260, y: 60 } });
  await page.getByRole('button', { name: 'H-Line' }).click();
  await plot.click({ position: { x: 300, y: 100 } });
  await page.getByTestId('ref-line-row-V1').getByRole('button', { name: 'Delete V1' }).click();
  await expect(page.locator('.ui-toast')).toContainText('Deleted V1');
  await page.getByTestId('ref-line-row-H1').getByRole('button', { name: 'Delete H1' }).click();
  // A new toast replaces the current one: never a stack.
  await expect(page.locator('.ui-toast')).toHaveCount(1);
  await expect(page.locator('.ui-toast')).toContainText('Deleted H1');
  const box = await page.locator('.ui-toast').boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('no toast box');
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(4);
  expect(viewport.height - (box.y + box.height)).toBeLessThan(80);
  await page.locator('.ui-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('ref-line-row-H1')).toBeVisible();
  await expect(page.locator('.ui-toast')).toHaveCount(0);
});

test('closing a file raises a toast, and a toast closes by itself after 5 seconds', async ({ page }) => {
  await loaded(page);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.lp-file').first().getByRole('button', { name: /Remove|Close|×/ }).first().click();
  await expect(page.locator('.ui-toast')).toContainText(/Closed|Removed/);
  await expect(page.locator('.ui-toast')).toHaveCount(0, { timeout: 8000 });
});
