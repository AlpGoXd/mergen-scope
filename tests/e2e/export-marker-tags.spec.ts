import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const exportDialog = (page: Page) => page.getByRole('dialog', { name: /^Export/ });
const pane = (page: Page, n: number) => page.getByTestId(`chart-pane-pane-${n}`);

async function openS21WithMarker(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  await expect(pane(page, 1).locator('.recharts-line').first()).toBeVisible();
  const plot = page.getByTestId('chart-plot-pane-1');
  await plot.click({ position: { x: 200, y: 120 } });
  await page.keyboard.press('n');
  await plot.click({ position: { x: 300, y: 150 } });
  await expect(page.getByTestId('marker-row-1')).toBeVisible();
}

async function paneExport(page: Page, index: number) {
  await page.getByTestId(`chart-pane-header-pane-${index}`).getByTitle('Pane settings').click();
  await page.locator(`.ui-popover[aria-label="Pane ${index} settings"]`).getByRole('button', { name: 'Export…', exact: true }).click();
  return exportDialog(page);
}

async function previewMarkup(dialog: Locator): Promise<string> {
  const img = dialog.getByRole('img', { name: /^Export preview/ });
  await expect(img).toBeVisible();
  return img.evaluate(async (node: HTMLImageElement) => (await fetch(node.src)).text());
}

async function inspectChartMarkers(page: Page, markup: string) {
  return page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const dots = [...doc.querySelectorAll('.recharts-reference-dot')];
    return {
      dots: dots.length,
      symbols: dots.reduce((count, dot) => count + dot.querySelectorAll('circle, polygon').length, 0),
      pills: dots.reduce((count, dot) => count + dot.querySelectorAll('rect').length, 0),
      leaders: dots.reduce((count, dot) => count + dot.querySelectorAll('line').length, 0),
      texts: dots.flatMap(dot => [...dot.querySelectorAll('text')].map(node => node.textContent ?? '')),
    };
  }, markup);
}

async function traceMidpoint(path: Locator) {
  return path.evaluate(element => {
    const curve = element as SVGPathElement;
    const point = curve.getPointAtLength(curve.getTotalLength() * 0.5);
    const matrix = curve.getScreenCTM();
    if (!matrix) throw new Error('Trace has no screen transform');
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  });
}

test('unchecking Marker tags removes marker labels in SVG, PDF and TikZ while keeping marker symbols', async ({ page }) => {
  await openS21WithMarker(page);
  const dialog = await paneExport(page, 1);

  // SVG (screen): checked has tag pill/leader/text; unchecked removes them while keeping the marker symbol.
  await dialog.getByRole('button', { name: 'SVG', exact: true }).click();
  const checkedSvg = await previewMarkup(dialog);
  const before = await inspectChartMarkers(page, checkedSvg);
  expect(before.dots).toBe(1);
  expect(before.symbols).toBeGreaterThanOrEqual(2);
  expect(before.pills).toBe(1);
  expect(before.leaders).toBe(1);
  expect(before.texts.some(text => text.startsWith('M1 '))).toBe(true);

  const markerTags = dialog.getByRole('checkbox', { name: 'Marker tags' });
  await markerTags.uncheck();
  await expect.poll(async () => (await inspectChartMarkers(page, await previewMarkup(dialog))).texts.length).toBe(0);
  const after = await inspectChartMarkers(page, await previewMarkup(dialog));
  expect(after.dots).toBe(1);
  expect(after.symbols).toBeGreaterThanOrEqual(2);
  expect(after.pills).toBe(0);
  expect(after.leaders).toBe(0);
  expect(after.texts).toEqual([]);

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save SVG' }).click();
  const savedSvg = await readFile(await (await download).path(), 'utf8');
  const savedStats = await inspectChartMarkers(page, savedSvg);
  expect(savedStats.symbols).toBeGreaterThanOrEqual(2);
  expect(savedStats.pills).toBe(0);
  expect(savedStats.leaders).toBe(0);
  expect(savedStats.texts).toEqual([]);

  // Paper / PDF: unchecking Marker tags removes paper leader & label text while keeping marker symbol.
  const pdfDialog = await paneExport(page, 1);
  await pdfDialog.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect.poll(async () => (await inspectChartMarkers(page, await previewMarkup(pdfDialog))).texts.length).toBe(1);
  await pdfDialog.getByRole('checkbox', { name: 'Marker tags' }).uncheck();
  await expect.poll(async () => (await inspectChartMarkers(page, await previewMarkup(pdfDialog))).texts.length).toBe(0);
  const pdfPreviewStats = await inspectChartMarkers(page, await previewMarkup(pdfDialog));
  expect(pdfPreviewStats.symbols).toBeGreaterThanOrEqual(2);
  expect(pdfPreviewStats.leaders).toBe(0);
  expect(pdfPreviewStats.texts).toEqual([]);

  // TikZ / LaTeX: unchecking Marker tags removes tag labels in both preview and code, while keeping marker circle node.
  await pdfDialog.getByRole('button', { name: 'TikZ', exact: true }).click();
  await pdfDialog.getByRole('checkbox', { name: 'Marker tags' }).uncheck();
  await expect.poll(async () => (await inspectChartMarkers(page, await previewMarkup(pdfDialog))).texts.length).toBe(0);
  const tikzPreviewStats = await inspectChartMarkers(page, await previewMarkup(pdfDialog));
  expect(tikzPreviewStats.symbols).toBeGreaterThanOrEqual(2);
  expect(tikzPreviewStats.leaders).toBe(0);

  await pdfDialog.getByRole('tab', { name: 'Code' }).click();
  const code = pdfDialog.locator('pre');
  await expect(code).toContainText('\\node[circle, fill=msTrace');
  const tex = await code.textContent();
  expect(tex).not.toContain('msTag');
  expect(tex).not.toContain('pin=');
  expect(tex).not.toMatch(/\{M1\b/);
});

test('unchecking Marker tags hides marker tags on Smith and Polar panes while keeping marker symbols', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(page.getByTestId('touchstone-cell-S11')).toBeVisible();

  // Smith pane in Pane 2
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 2).locator('.ptp-tile').filter({ hasText: 'Smith' }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  const smithPath = pane(page, 2).locator('[data-testid^="smith-trace-"] path').first();
  await expect(smithPath).toBeAttached();
  const smithPoint = await traceMidpoint(smithPath);
  await pane(page, 2).getByTestId('smith-plot').focus();
  await page.keyboard.press('n');
  await page.mouse.click(smithPoint.x, smithPoint.y);
  await expect(pane(page, 2).locator('.smith-marker')).toHaveCount(1);

  const smithDialog = await paneExport(page, 2);
  await smithDialog.getByRole('button', { name: 'SVG', exact: true }).click();
  const inspectSmith = async () => page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    return {
      glyphs: doc.querySelectorAll('.smith-marker-glyph').length,
      tags: doc.querySelectorAll('.smith-tag, .smith-tag-text, [data-paper-marker-label], [data-paper-marker-leader]').length,
    };
  }, await previewMarkup(smithDialog));
  await expect.poll(async () => (await inspectSmith()).tags).toBeGreaterThan(0);
  await smithDialog.getByRole('checkbox', { name: 'Marker tags' }).uncheck();
  await expect.poll(async () => (await inspectSmith()).tags).toBe(0);
  expect((await inspectSmith()).glyphs).toBe(1);
  await page.keyboard.press('Escape');

  // Polar pane in Pane 3
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 3).locator('.ptp-tile').filter({ hasText: 'Polar' }).click();
  await page.getByTestId('touchstone-cell-S21').click();
  const polarPath = pane(page, 3).locator('[data-testid^="polar-trace-"] path').first();
  await expect(polarPath).toBeVisible();
  const polarPoint = await traceMidpoint(polarPath);
  await pane(page, 3).getByTestId('polar-plot').focus();
  await page.keyboard.press('n');
  await page.mouse.click(polarPoint.x, polarPoint.y);
  await expect(pane(page, 3).locator('.polar-marker')).toHaveCount(1);

  const polarDialog = await paneExport(page, 3);
  await polarDialog.getByRole('button', { name: 'SVG', exact: true }).click();
  const inspectPolar = async () => page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    return {
      markers: doc.querySelectorAll('.polar-marker circle').length,
      tags: doc.querySelectorAll('.polar-marker rect, .polar-tag').length,
    };
  }, await previewMarkup(polarDialog));
  // The dialog remembers the SVG choice from the Smith step above, so start from checked.
  await polarDialog.getByRole('checkbox', { name: 'Marker tags' }).check();
  await expect.poll(async () => (await inspectPolar()).tags).toBeGreaterThan(0);
  await polarDialog.getByRole('checkbox', { name: 'Marker tags' }).uncheck();
  await expect.poll(async () => (await inspectPolar()).tags).toBe(0);
  expect((await inspectPolar()).markers).toBe(1);
});
