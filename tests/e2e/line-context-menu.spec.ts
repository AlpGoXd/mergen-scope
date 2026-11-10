import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

async function loaded(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
}

/** Resolves true when the page's `contextmenu` event ended up default-prevented (the browser menu is suppressed). */
function nextContextMenuPrevented(page: Page): Promise<boolean> {
  return page.evaluate(() => new Promise<boolean>(resolve => {
    document.addEventListener('contextmenu', event => setTimeout(() => resolve(event.defaultPrevented), 0), { once: true });
  }));
}

test('the browser menu never appears on a chart, its header or an empty pane', async ({ page }) => {
  await loaded(page);
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const targets = [
    page.getByTestId('chart-plot-pane-1'),
    page.getByTestId('chart-pane-header-pane-1'),
    page.getByTestId('chart-pane-pane-2'),
  ];
  for (const target of targets) {
    const prevented = nextContextMenuPrevented(page);
    await target.click({ button: 'right', position: { x: 60, y: 14 } });
    expect(await prevented).toBe(true);
  }
});

test('right-click on an empty chart does nothing except cancel an armed tool', async ({ page }) => {
  await loaded(page);
  const plot = page.getByTestId('chart-plot-pane-1');
  // Nothing armed: no menu, no line, nothing selected.
  await plot.click({ button: 'right', position: { x: 300, y: 150 } });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('[data-testid^="ref-line-row-"]')).toHaveCount(0);
  // Armed line tool: right-click cancels it, like Esc, and places nothing.
  const vLine = page.getByRole('button', { name: 'V-Line' });
  await vLine.click();
  await expect(vLine).toHaveAttribute('aria-pressed', 'true');
  await plot.click({ button: 'right', position: { x: 300, y: 150 } });
  await expect(vLine).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-testid^="ref-line-row-"]')).toHaveCount(0);
  // Armed marker tool: same.
  const newMarker = page.getByRole('button', { name: 'New Marker', exact: true });
  await newMarker.click();
  await expect(newMarker).toHaveAttribute('aria-pressed', 'true');
  await plot.click({ button: 'right', position: { x: 300, y: 150 } });
  await expect(newMarker).toHaveAttribute('aria-pressed', 'false');
});

test('a V line menu lists Show in, Edit value, List crossings, Remove from Pane N and a danger Delete V1', async ({ page }) => {
  await loaded(page);
  await page.getByRole('button', { name: 'V-Line' }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 60 } });
  await page.getByTestId('chart-plot-pane-1').locator('.ln-label').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'V1 line' });
  await expect(menu.getByRole('menuitem')).toHaveText([/^Show in/, /^Edit value/, /^List crossings/, /^Remove from Pane 1/, /^Delete V1/]);
  await expect(menu.getByRole('separator')).toHaveCount(1);
  await expect(menu.getByRole('menuitem', { name: /^Delete V1/ })).toHaveClass(/lp-menu__item--danger/);
  await expect(menu.getByRole('menuitem', { name: /^Delete V1/ })).toContainText('Del');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('an H line menu has only Edit value, List crossings and Delete', async ({ page }) => {
  await loaded(page);
  await page.getByRole('button', { name: 'H-Line' }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 120 } });
  await page.getByTestId('chart-plot-pane-1').locator('.ln-label').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'H1 line' });
  await expect(menu.getByRole('menuitem')).toHaveText([/^Edit value/, /^List crossings/, /^Delete H1/]);
  await expect(menu.getByRole('menuitem', { name: /^Delete H1/ })).toHaveClass(/lp-menu__item--danger/);
  await menu.getByRole('menuitem', { name: /^Delete H1/ }).click();
  await expect(page.locator('[data-testid^="ref-line-row-"]')).toHaveCount(0);
});
