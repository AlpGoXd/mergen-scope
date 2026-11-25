import { expect, test } from '@playwright/test';

import { acceptImport } from './import-helpers';

const DENSE_TITLE = /^Samples are on, but the points are too dense to draw at this zoom\. Zoom in about [\d\s]+× to see them\.$/;

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
  const callout = page.getByTestId('samples-callout');
  await expect(button).toHaveAttribute('data-state', 'off');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('data-state', 'dense');
  await expect(button).toHaveAttribute('title', DENSE_TITLE);
  // Switching Samples on while too dense explains it once, from the button.
  await expect(callout).toBeVisible();
  await expect(callout).toContainText(/too dense to draw at this zoom\. Zoom in about [\d\s]+× to see them/);
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
  await expect(button).toHaveAttribute('data-state', 'on');
  await expect(callout).toHaveCount(0);
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
  await expect(button).toHaveAttribute('title', DENSE_TITLE);
  await expect(button).toHaveAttribute('data-state', 'dense');
  // Zooming back out does not reopen the callout: it only appears when Samples is switched on.
  await expect(callout).toHaveCount(0);
  await expect(symbolDots).toHaveCount(0);
  await expect(plot.getByTestId('trace-symbol').first()).toBeVisible();
});

test('the too-dense callout zooms in far enough to draw the sample dots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/app.html');
  const rows = Array.from({ length: 5000 }, (_, i) => `${i},${Math.sin(i / 100)}`).join('\n');
  await page.getByTestId('app-open-input').setInputFiles({
    name: 'dense.csv', mimeType: 'text/csv', buffer: Buffer.from(`Time (s),CH1 (V)\n${rows}\n`),
  });
  await acceptImport(page);
  const pane = page.getByTestId('chart-pane-pane-1');
  const button = pane.getByTestId('samples-toggle');
  const callout = page.getByTestId('samples-callout');
  await button.click();
  await expect(callout).toBeVisible();
  await callout.getByRole('button', { name: 'Dismiss' }).click();
  await expect(callout).toHaveCount(0);
  await expect(button).toHaveAttribute('data-state', 'dense');
  // Off and on again shows it again; its Zoom in button zooms X around the centre until the dots draw.
  await button.click();
  await button.click();
  await expect(callout).toBeVisible();
  await callout.getByRole('button', { name: /^Zoom in [\d\s]+×$/ }).click();
  await expect(callout).toHaveCount(0);
  await expect(button).toHaveAttribute('data-state', 'on');
  await expect(pane.getByTestId('chart-plot-pane-1').locator('.recharts-line-dot').first()).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`Samples shows its state with a dot and stays neutral on the active header in ${theme}, normal and high contrast`, async ({ page }) => {
    // No colour transitions, so each read sees the settled theme colours.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.goto('/app.html');
    await page.getByTestId('app-open-input').setInputFiles({ name: 'samples.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
    await acceptImport(page);
    const header = page.getByTestId('chart-pane-header-pane-1');
    await expect(header).toHaveClass(/is-target/);
    const button = header.getByTestId('samples-toggle');
    const look = async () => button.evaluate(node => {
      const dot = node.querySelector('.ph-samples-dot');
      const head = node.closest('.ph');
      return {
        fill: getComputedStyle(node).backgroundColor,
        header: head ? getComputedStyle(head).backgroundColor : '',
        dot: dot ? getComputedStyle(dot).backgroundColor : '',
      };
    });
    const transparent = 'rgba(0, 0, 0, 0)';
    for (const contrast of ['Normal', 'High'] as const) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'App settings' });
      await sheet.getByRole('button', { name: contrast, exact: true }).click();
      await sheet.getByRole('button', { name: 'Close settings' }).click();
      await expect(button).toHaveAttribute('data-state', 'off');
      const off = await look();
      await button.click();
      await expect(button).toHaveAttribute('data-state', 'on');
      const on = await look();
      // The button stays neutral (never the header's fill); the dot is hollow when off and filled when on.
      expect(on.fill, contrast).toBe(off.fill);
      expect(on.fill, contrast).not.toBe(on.header);
      expect(off.dot, contrast).toBe(transparent);
      expect(on.dot, contrast).not.toBe(transparent);
      await button.click();
    }
  });
}
