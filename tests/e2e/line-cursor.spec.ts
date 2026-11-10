import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

// A new line lands exactly at the cursor: a V line at the cursor's X value, an H line at its Y value, in any pane.
async function twoPanes(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await trace.getByTitle('Show in panes').click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.keyboard.press('Escape');
}

/** The axis value under a pixel, from the pane's real plot rectangle and scale domains (published on the lines layer). */
async function axisValueAt(page: Page, paneId: string, px: number, py: number): Promise<{ x: number; y: number }> {
  const layer = page.getByTestId(`chart-plot-${paneId}`).getByTestId('lines-layer');
  const plot = (await layer.getAttribute('data-plot'))?.split(',').map(Number) ?? [];
  const xd = (await layer.getAttribute('data-x-domain'))?.split(',').map(Number) ?? [];
  const yd = (await layer.getAttribute('data-y-domain'))?.split(',').map(Number) ?? [];
  const svg = await page.getByTestId(`chart-plot-${paneId}`).locator('svg.recharts-surface').first().boundingBox();
  if (!svg || plot.length !== 4 || xd.length !== 2 || yd.length !== 2) throw new Error('plot geometry unavailable');
  const [left, top, width, height] = plot as [number, number, number, number];
  const fx = (px - svg.x - left) / width, fy = (py - svg.y - top) / height;
  return { x: xd[0]! + fx * (xd[1]! - xd[0]!), y: yd[1]! - fy * (yd[1]! - yd[0]!) };
}

for (const paneId of ['pane-1', 'pane-2'] as const) {
  for (const view of ['auto', 'zoomed'] as const) {
    for (const kind of ['v', 'h'] as const) {
      test(`a ${kind.toUpperCase()} line placed by clicking in ${paneId} (${view} view) lands at the cursor`, async ({ page }) => {
        await twoPanes(page);
        const box = await page.getByTestId(`chart-plot-${paneId}`).boundingBox();
        if (!box) throw new Error('no pane box');
        if (view === 'zoomed') {
          // Scroll zooms Y about the cursor; right-drag zooms X into a window.
          await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
          await page.mouse.wheel(0, -300);
          await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
          await page.mouse.down({ button: 'right' });
          await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 8 });
          await page.mouse.up({ button: 'right' });
        }
        const px = box.x + box.width * 0.37, py = box.y + box.height * 0.31;
        const expected = await axisValueAt(page, paneId, px, py);
        await page.getByRole('button', { name: kind === 'v' ? 'V-Line' : 'H-Line' }).click();
        await page.mouse.click(px, py);
        const row = page.getByTestId(`ref-line-row-${kind.toUpperCase()}1`);
        await expect(row).toBeVisible();
        const value = Number(await row.getAttribute('data-value'));
        if (kind === 'v') {
          const span = Math.abs((await axisValueAt(page, paneId, box.x + box.width * 0.9, py)).x - (await axisValueAt(page, paneId, box.x + box.width * 0.1, py)).x);
          expect(Math.abs(value - expected.x)).toBeLessThan(span * 0.01);
        } else {
          const span = Math.abs((await axisValueAt(page, paneId, px, box.y + box.height * 0.1)).y - (await axisValueAt(page, paneId, px, box.y + box.height * 0.9)).y);
          expect(Math.abs(value - expected.y)).toBeLessThan(span * 0.01);
        }
        // The line is drawn where it was clicked, in the pane it was placed in.
        await expect(page.getByTestId(`chart-plot-${paneId}`).locator('.ln-g')).toHaveCount(1);
        const line = await page.getByTestId(`chart-plot-${paneId}`).locator('.ln-line').boundingBox();
        if (kind === 'v') expect(Math.abs((line?.x ?? 0) - px)).toBeLessThan(3);
        else expect(Math.abs((line?.y ?? 0) - py)).toBeLessThan(3);
      });
    }
  }
}
