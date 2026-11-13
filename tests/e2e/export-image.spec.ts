import { expect, test } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pane = (page: Page, n: number) => page.getByTestId(`chart-pane-pane-${n}`);
const header = (page: Page, n: number) => page.getByTestId(`chart-pane-header-pane-${n}`);
const settingsOf = (page: Page, n: number) => page.locator(`.ui-popover[aria-label="Pane ${n} settings"]`);

async function openS21(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.recharts-line').first()).toBeVisible();
}

async function paneWidth(page: Page, n: number): Promise<number> {
  const box = await pane(page, n).boundingBox();
  if (!box) throw new Error('pane has no box');
  return Math.round(box.width);
}

async function pngSize(download: Download): Promise<{ width: number; height: number }> {
  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const lastSvg = (page: Page) => page.evaluate(() => window.__mergenLastExportSvg ?? '');

test('Copy image puts a 2× PNG of the pane on the clipboard, from the pane menu and from Ctrl+Shift+C', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openS21(page);
  const width = await paneWidth(page, 1);
  const clipboardImageWidth = () => page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find(entry => entry.types.includes('image/png'));
    if (!item) return 0;
    return (await createImageBitmap(await item.getType('image/png'))).width;
  });

  await header(page, 1).getByTitle('Pane settings').click();
  const actions = settingsOf(page, 1).getByRole('group', { name: 'Pane 1 actions' });
  await expect(actions.getByRole('button')).toHaveText(['Copy image', 'Download image', 'Export data (CSV)…', 'Export…', 'Close pane']);
  await actions.getByRole('button', { name: 'Copy image' }).click();
  await expect(settingsOf(page, 1)).toHaveCount(0);
  await expect(page.locator('.ui-toast')).toContainText('Pane 1 copied as image');
  expect(Math.abs(await clipboardImageWidth() - width * 2)).toBeLessThanOrEqual(2);

  await page.evaluate(() => navigator.clipboard.writeText('empty'));
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+Shift+C');
  await expect(page.locator('.ui-toast')).toContainText('Pane 1 copied as image');
  await expect.poll(clipboardImageWidth).toBeGreaterThan(0);
});

test('Download image saves {file}_{pane}_{date}.png at 2× pane size, and at 1050 px for 1 IEEE column at 300 dpi', async ({ page }) => {
  await openS21(page);
  const width = await paneWidth(page, 1);
  await header(page, 1).getByTitle('Pane settings').click();
  let download = page.waitForEvent('download');
  await settingsOf(page, 1).getByRole('button', { name: 'Download image' }).click();
  const first = await download;
  expect(first.suggestedFilename()).toMatch(/^cascaded-chain_Pane-1_\d{4}-\d{2}-\d{2}\.png$/);
  expect(Math.abs((await pngSize(first)).width - width * 2)).toBeLessThanOrEqual(2);
  await expect(page.locator('.ui-toast')).toContainText(`Saved ${first.suggestedFilename()}`);

  await page.locator('.ui-toast').getByRole('button', { name: 'Options…' }).click();
  const options = page.getByTestId('export-options');
  await options.getByRole('button', { name: '1 IEEE column (88.9 mm)' }).click();
  await options.getByRole('button', { name: '300', exact: true }).click();
  download = page.waitForEvent('download');
  await options.getByRole('button', { name: 'Download image' }).click();
  const paper = await pngSize(await download);
  expect(paper.width).toBe(1050);
  expect(paper.height).toBeGreaterThan(0);
  // Remembered in this browser: Ctrl+Shift+S uses the same options.
  download = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+S');
  expect((await pngSize(await download)).width).toBe(1050);
  expect(await lastSvg(page)).toContain('Times New Roman');
});

test('the exported SVG has trace symbols and a legend, and no crosshair, selection ring or header', async ({ page }) => {
  await openS21(page);
  const plot = page.getByTestId('chart-plot-pane-1');
  // Place and select a marker, and hover so the crosshair shows on screen.
  await plot.click({ position: { x: 200, y: 120 } });
  await page.keyboard.press('n');
  await plot.click({ position: { x: 300, y: 150 } });
  await expect(page.getByTestId('marker-row-1')).toBeVisible();
  if (await plot.locator('circle[r="9"]').count() === 0) await page.getByTestId('marker-row-1').click({ position: { x: 4, y: 4 } });
  await expect(plot.locator('circle[r="9"]')).toHaveCount(1);
  const box = await plot.boundingBox();
  if (!box) throw new Error('plot has no box');
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
  await expect(plot.locator('.recharts-reference-line line[stroke-dasharray="4 4"]')).not.toHaveCount(0);
  await page.keyboard.press('Control+Shift+S');
  await expect(page.locator('.ui-toast')).toContainText('Saved');
  const svg = await lastSvg(page);
  const result = await page.evaluate(markup => {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const dashed = [...doc.querySelectorAll('.recharts-reference-line line')].filter(line => /^4(px)?,?\s+4(px)?$/.test((line as SVGElement).style.strokeDasharray.trim()) || line.getAttribute('stroke-dasharray') === '4 4');
    return {
      parsed: doc.documentElement.nodeName,
      symbols: doc.querySelectorAll('[data-testid="trace-symbol"]').length,
      rings: doc.querySelectorAll('circle[r="9"]').length,
      crosshair: dashed.length + doc.querySelectorAll('.x-ghost-crosshair').length,
      header: doc.querySelectorAll('[class*="ph-"], [data-testid^="chart-pane-header"]').length,
      legend: [...doc.querySelectorAll('[data-export-legend-item] text')].map(text => text.textContent ?? ''),
    };
  }, svg);
  expect(result.parsed).toBe('svg');
  expect(result.symbols).toBeGreaterThan(0);
  expect(result.rings).toBe(0);
  expect(result.crosshair).toBe(0);
  expect(result.header).toBe(0);
  // One legend entry per plotted trace, with the full name (never shortened).
  expect(result.legend).toHaveLength(await plot.locator('.recharts-line').count());
  expect(result.legend).toContain('cascaded chain.s2p S21 magnitude-db');
  expect(svg).not.toContain('Pane settings');
  expect(svg).not.toContain('var(--');
  // On screen nothing changed: the marker is still selected and the app setting still hides symbols.
  await expect(plot.locator('circle[r="9"]')).toHaveCount(1);
  await expect(plot.getByTestId('trace-symbol')).toHaveCount(0);
});

test('a Smith pane exports through its own renderer', async ({ page }) => {
  await openS21(page);
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 2).locator('.ptp-tile').filter({ hasText: 'Smith' }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(pane(page, 2).locator('[data-testid^="smith-trace-"]').first()).toBeVisible();
  const width = await paneWidth(page, 2);
  await header(page, 2).getByTitle('Pane settings').click();
  const download = page.waitForEvent('download');
  await settingsOf(page, 2).getByRole('button', { name: 'Download image' }).click();
  expect(Math.abs((await pngSize(await download)).width - width * 2)).toBeLessThanOrEqual(2);
  const svg = await lastSvg(page);
  expect(svg).toContain('smith-trace-');
  expect(svg).toContain('data-export-legend');
});

test('a blocked clipboard shows the message bar with the reason and Download image', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'write', { configurable: true, value: () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError')) });
  });
  await openS21(page);
  await header(page, 1).getByTitle('Pane settings').click();
  await settingsOf(page, 1).getByRole('button', { name: 'Copy image' }).click();
  const notice = page.getByTestId('export-notice');
  await expect(notice).toContainText('Could not copy Pane 1 to the clipboard: Write permission denied.');
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await header(page, 1).getByTitle('Pane settings').click();
  await expect(settingsOf(page, 1)).not.toContainText('denied');
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await notice.getByRole('button', { name: 'Download image' }).click();
  expect((await download).suggestedFilename()).toMatch(/_Pane-1_\d{4}-\d{2}-\d{2}\.png$/);
  await expect(notice).toHaveCount(0);
});
