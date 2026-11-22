import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { acceptImport } from './import-helpers';
import { answerAppDialog, clearWorkspace } from './workspace-helpers';
import { linkX } from './x-link-helpers';

async function curvePoint(path: Locator) {
  return path.evaluate(element => {
    const curve = element as SVGPathElement;
    const matrix = curve.getScreenCTM();
    if (!matrix) throw new Error('Missing curve transform');
    const point = curve.getPointAtLength(curve.getTotalLength() / 2).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
}

test('Polar plots S21, supports a marker and radius options, refuses time captures and reopens', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(page.getByTestId('touchstone-cell-S21')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const pane = page.getByTestId('chart-pane-pane-2');
  await pane.locator('.ptp-tile').filter({ hasText: 'Polar' }).click();
  await expect(pane.getByText('Empty Polar pane')).toBeVisible();
  await page.getByTestId('touchstone-cell-S21').click();
  const plot = pane.getByTestId('polar-plot');
  const curve = plot.locator('[data-testid^="polar-trace-"] path').first();
  await expect(curve).toBeVisible();
  await expect(plot.getByTestId('polar-grid').locator('circle').first()).toBeVisible();
  await expect(pane.getByTestId('smith-range-bar')).toBeVisible();
  await plot.focus();
  await page.keyboard.press('n');
  const position = await curvePoint(curve);
  await page.mouse.move(position.x, position.y);
  await expect(plot.getByTestId('polar-crosshair')).toBeAttached();
  await page.mouse.click(position.x, position.y);
  await expect(pane.getByTestId('polar-readout')).toContainText(/M1 [●≈] S21 .*\|S21\| .* ∠ /);

  const settingsButton = pane.getByRole('button', { name: 'Pane settings' });
  const settings = page.locator('.ui-popover[aria-label="Pane 2 settings"]');
  await settingsButton.click();
  await settings.getByRole('button', { name: 'dB', exact: true }).click();
  await expect(plot.getByRole('img')).toHaveAttribute('data-radius', 'db');
  await expect(plot.getByTestId('polar-grid')).toContainText('dB');
  await settings.getByRole('button', { name: 'Linear', exact: true }).click();
  await expect(plot.getByRole('img')).toHaveAttribute('data-radius', 'linear');
  await settings.getByRole('button', { name: 'Top', exact: true }).click();
  await settings.getByRole('button', { name: 'CW', exact: true }).click();
  const latex = settings.getByRole('button', { name: 'Copy as LaTeX' });
  await expect(latex).toBeDisabled();
  await latex.locator('..').hover();
  await expect(page.getByText('Not available for Polar panes yet')).toBeVisible();
  const svgDownload = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const svgPath = await (await svgDownload).path();
  if (!svgPath) throw new Error('SVG was not downloaded');
  expect(readFileSync(svgPath, 'utf8')).toContain('Polar plot S21');
  await settingsButton.click();
  const pngDownload = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Download image', exact: true }).click();
  const pngPath = await (await pngDownload).path();
  if (!pngPath) throw new Error('PNG was not downloaded');
  expect(readFileSync(pngPath).subarray(1, 4).toString()).toBe('PNG');
  await page.keyboard.press('Escape');
  await pane.evaluate(target => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['Time (s),CH1 (V)\n0,1\n1,2\n2,1\n'], 'time.csv', { type: 'text/csv' }));
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }
  });
  await acceptImport(page);
  await expect(pane.getByRole('status')).toContainText('Polar needs a complex network trace or an angle on X');

  const download = page.waitForEvent('download');
  await page.getByTitle('Save Workspace JSON').click();
  const path = await (await download).path();
  if (!path) throw new Error('Missing workspace');
  await clearWorkspace(page);
  await expect(plot).toHaveCount(0);
  await page.getByTestId('topbar-workspace-input').setInputFiles(path);
  await answerAppDialog(page, 'Replace');
  await expect(curve).toBeVisible();
  await settingsButton.click();
  await expect(settings.getByRole('button', { name: 'Top', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('button', { name: 'CW', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('an angle CSV closes a full-turn pattern and omits the frequency slider', async ({ page }) => {
  await page.goto('/app.html');
  const pane = page.getByTestId('chart-pane-pane-1');
  await pane.locator('.ptp-tile').filter({ hasText: 'Polar' }).click();
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/antenna-far-field-azimuth.csv'));
  await acceptImport(page);
  const plot = pane.getByTestId('polar-plot');
  await expect(plot.locator('[data-testid^="polar-trace-"] path')).toHaveAttribute('d', / Z$/);
  await expect(plot.getByTestId('polar-grid')).toContainText('330°');
  await expect(pane.getByTestId('smith-range-bar')).toHaveCount(0);
  const position = await curvePoint(plot.locator('[data-testid^="polar-trace-"] path'));
  await page.mouse.move(position.x, position.y);
  await expect(pane.getByTestId('polar-readout')).toContainText(/antenna-far-field-azimuth.csv .*° .* dBi/);
});

test('Polar keeps a linked frequency band through radial zoom and Backspace', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(page.getByTestId('touchstone-cell-S21')).toBeVisible();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const pane = page.getByTestId('chart-pane-pane-2');
  await pane.locator('.ptp-tile').filter({ hasText: 'Polar' }).click();
  await page.getByTestId('touchstone-cell-S21').click();
  await linkX(page, 1, 2);
  const chart = page.getByTestId('chart-plot-pane-1');
  const area = await chart.boundingBox();
  if (!area) throw new Error('Missing chart plot');
  const y = area.y + area.height / 2;
  await page.mouse.move(area.x + area.width * 0.3, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(area.x + area.width * 0.7, y, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(pane.getByTestId('smith-range-linked')).toContainText('Pane 1');
  await expect(pane.locator('[data-testid^="polar-trace-"] path[opacity="0.22"]').first()).toBeAttached();
  const view = chart.getByTestId('lines-layer');
  const band = await view.getAttribute('data-x-domain');
  const plot = pane.getByTestId('polar-plot');
  const curve = plot.locator('[data-testid^="polar-trace-"] path[opacity="1"]').first();
  const fit = await curve.getAttribute('d');
  if (!fit || !band) throw new Error('Missing fitted path or frequency band');
  await plot.hover();
  await page.mouse.wheel(0, -200);
  await expect(curve).not.toHaveAttribute('d', fit);
  await plot.focus();
  await page.keyboard.press('Backspace');
  await expect(curve).toHaveAttribute('d', fit);
  await expect(view).toHaveAttribute('data-x-domain', band);
});
