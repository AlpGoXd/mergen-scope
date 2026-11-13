import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pane = (page: Page, n: number) => page.getByTestId(`chart-pane-pane-${n}`);
const header = (page: Page, n: number) => page.getByTestId(`chart-pane-header-pane-${n}`);
const settingsOf = (page: Page, n: number) => page.locator(`.ui-popover[aria-label="Pane ${n} settings"]`);
const lastSvg = (page: Page) => page.evaluate(() => window.__mergenLastExportSvg ?? '');
const setOptions = (page: Page, options: object) => page.evaluate(value => localStorage.setItem('mergen-export-image-options', JSON.stringify(value)), options);

async function openS21(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  await expect(page.getByTestId('chart-plot-pane-1').locator('.recharts-line').first()).toBeVisible();
}

async function placeMarker(page: Page) {
  const plot = page.getByTestId('chart-plot-pane-1');
  await plot.click({ position: { x: 200, y: 120 } });
  await page.keyboard.press('n');
  await plot.click({ position: { x: 300, y: 150 } });
  await expect(page.getByTestId('marker-row-1')).toBeVisible();
}

/** Computed strokes of the plotted trace lines, in order, in a document or in an exported SVG. */
const screenStrokes = (page: Page) => page.getByTestId('chart-plot-pane-1').evaluate(root =>
  [...root.querySelectorAll('.recharts-line path.recharts-line-curve')].map(path => getComputedStyle(path).stroke));
const svgStrokes = (page: Page, svg: string) => page.evaluate(markup => {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return [...doc.querySelectorAll('.recharts-line path.recharts-line-curve')].map(path => (path as SVGElement).style.stroke);
}, svg);
/** Distinct computed strokes of the exported trace symbols (they must be the lines' colours, in the export theme). */
const svgSymbolStrokes = (page: Page, svg: string) => page.evaluate(markup => {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return [...new Set([...doc.querySelectorAll('[data-testid="trace-symbol"] path')].map(path => (path as SVGElement).style.stroke))].sort();
}, svg);
const svgBackground = (page: Page, svg: string) => page.evaluate(markup => new DOMParser().parseFromString(markup, 'image/svg+xml').querySelector('svg > rect')?.getAttribute('fill') ?? '', svg);

test('Download SVG saves a standalone vector file sized in millimetres for 1 IEEE column', async ({ page }) => {
  await openS21(page);
  await setOptions(page, { size: 'ieee-1', dpi: 600, theme: 'print' });
  await header(page, 1).getByTitle('Pane settings').click();
  const download = page.waitForEvent('download');
  await settingsOf(page, 1).getByRole('button', { name: 'Download SVG' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^cascaded-chain_Pane-1_\d{4}-\d{2}-\d{2}\.svg$/);
  const svg = await readFile(await file.path(), 'utf8');
  expect(svg.startsWith('<?xml')).toBe(true);
  const facts = await page.evaluate(markup => {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const root = doc.documentElement;
    return { name: root.nodeName, error: doc.querySelector('parsererror') !== null, width: root.getAttribute('width'), height: root.getAttribute('height'), viewBox: root.getAttribute('viewBox'), symbols: doc.querySelectorAll('[data-testid="trace-symbol"]').length, lines: doc.querySelectorAll('.recharts-line').length };
  }, svg);
  expect(facts).toMatchObject({ name: 'svg', error: false, width: '88.9mm', symbols: expect.any(Number) });
  expect(facts.height).toMatch(/^\d+(\.\d+)?mm$/);
  expect(facts.viewBox).toMatch(/^0 0 336 \d+$/);
  expect(facts.symbols).toBeGreaterThan(0);
  expect(facts.lines).toBe(2);
  expect(svg).not.toContain('var(--');
  await expect(page.locator('.ui-toast')).toContainText(`Saved ${file.suggestedFilename()}`);
});

test('Copy as LaTeX puts a pgfplots figure of the pane on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openS21(page);
  await placeMarker(page);
  await header(page, 1).getByTitle('Pane settings').click();
  await settingsOf(page, 1).getByRole('button', { name: 'Copy as LaTeX' }).click();
  await expect(page.locator('.ui-toast')).toContainText('Pane 1 copied as LaTeX');
  const tex = await page.evaluate(() => navigator.clipboard.readText());
  expect(tex).toContain('\\begin{tikzpicture}');
  expect(tex).toContain('\\begin{axis}[');
  expect(tex).toContain('xlabel={Frequency (GHz)}');
  // The same Y title the chart draws.
  expect(tex).toMatch(/ylabel=\{[A-Za-z]+ \(dB\)\}/);
  expect((tex.match(/\\addplot\[/g) ?? []).length).toBe(2);
  expect((tex.match(/\\definecolor\{msTrace[A-Z]+\}\{RGB\}/g) ?? []).length).toBe(2);
  expect(tex).toContain('\\addlegendentry{cascaded chain.s2p S21 magnitude-db}');
  expect(tex).toMatch(/\\node\[circle, fill=msTrace[A-Z]+,.*\]90:\{M1 [\d.]+ GHz\}\}\] at \(axis cs:[-\d.e]+,[-\d.e]+\)/);
  expect(tex).toMatch(/xmin=[-\d.e]+, xmax=[-\d.e]+, ymin=[-\d.e]+, ymax=[-\d.e]+/);
});

test('the top bar Export… menu acts on the target pane and names it in each item', async ({ page }) => {
  await openS21(page);
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 2).locator('.ptp-tile').filter({ hasText: 'Smith' }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(pane(page, 2).locator('[data-testid^="smith-trace-"]').first()).toBeVisible();

  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 5, y: 5 } });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Export' });
  const items = menu.getByRole('menuitem');
  await expect(items).toHaveCount(6);
  await expect(items.nth(0)).toContainText('Copy image · Pane 1');
  await expect(items.nth(0)).toContainText('Ctrl+Shift+C');
  await expect(items.nth(1)).toContainText('Download image · Pane 1');
  await expect(items.nth(1)).toContainText('Ctrl+Shift+S');
  await expect(items.nth(2)).toContainText('Download SVG · Pane 1');
  await expect(items.nth(3)).toContainText('Copy as LaTeX · Pane 1');
  await expect(items.nth(4)).toContainText('Export data (CSV)…');
  const allPanes = items.nth(5);
  await expect(allPanes).toContainText('All panes…');
  await expect(allPanes).toHaveAttribute('aria-disabled', 'true');
  await expect(allPanes).toHaveAttribute('title', 'Coming with the export dialog');
  await expect(allPanes).toContainText('Coming with the export dialog');
  const download = page.waitForEvent('download');
  await items.nth(2).click();
  expect((await download).suggestedFilename()).toMatch(/_Pane-1_\d{4}-\d{2}-\d{2}\.svg$/);
  await expect(menu).toHaveCount(0);

  // Target the Smith pane: the items follow it, and LaTeX says why it is not available.
  await pane(page, 2).getByTestId('smith-pane').click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(items.nth(0)).toContainText('Copy image · Pane 2');
  await expect(items.nth(3)).toHaveAttribute('aria-disabled', 'true');
  await expect(items.nth(3)).toHaveAttribute('title', 'Copy as LaTeX supports chart panes for now');
  await page.keyboard.press('Escape');
});

test('paper sizes scale symbols, dots, marker glyphs and tags with the 8 pt text; pane size keeps screen sizes', async ({ page }) => {
  await openS21(page);
  await placeMarker(page);
  await page.getByTestId('chart-pane-pane-1').getByTestId('samples-toggle').click();
  const measure = async () => page.evaluate(markup => {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const symbol = doc.querySelector('[data-testid="trace-symbol"]')?.getAttribute('transform') ?? '';
    const dot = Number(doc.querySelector('[data-testid="sample-dot"]')?.getAttribute('r'));
    const tag = [...doc.querySelectorAll('text')].find(text => text.textContent?.startsWith('M1 '));
    return { symbol, dot, tagSize: tag ? parseFloat((tag as SVGElement).style.fontSize) : 0 };
  }, await lastSvg(page));

  await setOptions(page, { size: 'pane', dpi: 600, theme: 'print' });
  await page.keyboard.press('Control+Shift+S');
  await expect(page.locator('.ui-toast')).toContainText('Saved');
  const screen = await measure();
  expect(screen.symbol).not.toContain('scale(');
  expect(screen.dot).toBe(2);
  expect(screen.tagSize).toBe(11);

  await setOptions(page, { size: 'ieee-1', dpi: 300, theme: 'print' });
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+Shift+S');
  await expect.poll(async () => (await measure()).tagSize).toBe(10);
  const paper = await measure();
  // 2.5 pt radius = 3.33 css px against the 3.6 px screen symbol; dots follow.
  const scale = Number(/scale\(([\d.]+)\)/.exec(paper.symbol)?.[1]);
  expect(scale).toBeCloseTo(3.3333 / 3.6, 3);
  expect(paper.dot).toBeCloseTo(2 * scale, 3);
});

test('Print and Dark exports use the same trace colours as the app, whatever the app theme', async ({ page }) => {
  await openS21(page);
  const exportWith = async (theme: 'print' | 'dark') => {
    await setOptions(page, { size: 'pane', dpi: 600, theme });
    await page.getByTestId('chart-plot-pane-1').click({ position: { x: 5, y: 5 } });
    const before = await lastSvg(page);
    await page.keyboard.press('Control+Shift+S');
    await expect.poll(() => lastSvg(page)).not.toBe(before);
    return lastSvg(page);
  };
  const setAppTheme = async (name: 'Light' | 'Dark') => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('dialog', { name: 'App settings' }).getByRole('group', { name: 'Theme', exact: true }).getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${name.toLowerCase()}`));
  };

  await setAppTheme('Light');
  const light = await screenStrokes(page);
  expect(light).toHaveLength(2);
  expect(await svgStrokes(page, await exportWith('print'))).toEqual(light);

  await setAppTheme('Dark');
  const dark = await screenStrokes(page);
  const darkBackground = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  expect(dark).not.toEqual(light);
  const darkFromDarkApp = await exportWith('dark');
  expect(await svgStrokes(page, darkFromDarkApp)).toEqual(dark);
  expect(await svgBackground(page, darkFromDarkApp)).toBe(darkBackground);

  // The export container resolves the dark tokens from the stylesheet even when the app is light.
  await setAppTheme('Light');
  const darkFromLightApp = await exportWith('dark');
  expect(await svgStrokes(page, darkFromLightApp)).toEqual(dark);
  expect(await svgSymbolStrokes(page, darkFromLightApp)).toEqual([...dark].sort());
  expect(await svgBackground(page, darkFromLightApp)).toBe(darkBackground);
  expect(await svgSymbolStrokes(page, await exportWith('print'))).toEqual([...light].sort());
  const gridStroke = (svg: string) => page.evaluate(markup => (new DOMParser().parseFromString(markup, 'image/svg+xml').querySelector('.recharts-cartesian-grid line') as SVGElement | null)?.style.stroke ?? '', svg);
  expect(await gridStroke(darkFromLightApp)).toBe(await gridStroke(darkFromDarkApp));
});
