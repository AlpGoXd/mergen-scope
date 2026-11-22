import { expect, test } from '@playwright/test';

import { acceptImport } from './import-helpers';

test('pane settings and the header keep sample dots in sync and undo', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'samples.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
  await acceptImport(page);
  const pane = page.getByTestId('chart-pane-pane-1');
  const dots = pane.locator('.recharts-line-dot');
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await pane.getByTitle('Pane settings').click();
  const settings = page.locator('.ui-popover[aria-label="Pane 1 settings"]');
  await expect(settings.getByText('Display', { exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Samples' }).click();
  await expect(dots).toHaveCount(3);
  await pane.getByTitle('Pane settings').click();
  await expect(pane.getByRole('button', { name: 'Pane actions' })).toHaveCount(0);
  await pane.getByTestId('samples-toggle').click();
  await expect(dots).toHaveCount(0);
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(dots).toHaveCount(3);
  await pane.getByTitle('Pane settings').click();
  await expect(settings.getByRole('button', { name: 'Samples' })).toHaveAttribute('aria-pressed', 'true');
});

test('dense traces keep Samples pressed and reveal measured dots after zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/app.html');
  const rows = Array.from({ length: 5000 }, (_, i) => `${i},${i / 1000}`).join('\n');
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'dense.csv', mimeType: 'text/csv', buffer: Buffer.from(`Time (s),CH1 (V)\n${rows}\n`),
  });
  await acceptImport(page);
  const pane = page.getByTestId('chart-pane-pane-1');
  const plot = pane.getByTestId('chart-plot-pane-1');
  const lines = plot.getByTestId('lines-layer');
  await expect(lines).toHaveAttribute('data-x-domain', '0,4999');
  const button = pane.getByTestId('samples-toggle');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('title', 'Zoom in to see the sample points');
  const lineDots = plot.locator('.recharts-line-dot');
  await expect(lineDots).toHaveCount(0);

  const box = await plot.boundingBox();
  if (!box) throw new Error('Chart plot has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 15, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 15, y, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(button).toHaveAttribute('title', 'Show the measured sample points');
  const [left, right] = (await lines.getAttribute('data-x-domain') ?? '').split(',').map(Number);
  if (left === undefined || right === undefined || !(right > left)) throw new Error('Chart zoom range unavailable');
  const measuredCount = Math.floor(right) - Math.ceil(left) + 1;
  expect(measuredCount).toBeGreaterThan(0);
  await expect(lineDots).toHaveCount(measuredCount);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Always', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  const symbolDots = plot.getByTestId('sample-dot');
  await expect(symbolDots).toHaveCount(measuredCount);
  await expect(symbolDots.first()).toHaveAttribute('data-sample-index', String(Math.ceil(left)));
  await expect(plot.getByTestId('trace-symbol').first()).toBeVisible();
  await expect(lineDots).toHaveCount(0);

  await plot.dblclick({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(lines).toHaveAttribute('data-x-domain', '0,4999');
  await expect(button).toHaveAttribute('title', 'Zoom in to see the sample points');
  await expect(symbolDots).toHaveCount(0);
  await expect(plot.getByTestId('trace-symbol').first()).toBeVisible();
});
