import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const exportDialog = (page: Page) => page.getByRole('dialog', { name: /^Export/ });
const pane = (page: Page, n: number) => page.getByTestId(`chart-pane-pane-${n}`);

async function openChart(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S21').click();
  await expect(pane(page, 1).locator('.recharts-line').first()).toBeVisible();
}

async function paneExport(page: Page, index: number) {
  await page.getByTestId(`chart-pane-header-pane-${index}`).getByTitle('Pane settings').click();
  await page.locator(`.ui-popover[aria-label="Pane ${index} settings"]`).getByRole('button', { name: 'Export…', exact: true }).click();
  return exportDialog(page);
}

test('the dialog downloads vector PDF at each exact IEEE paper width', async ({ page }, info) => {
  await openChart(page);
  const plot = page.getByTestId('chart-plot-pane-1');
  await plot.click({ position: { x: 200, y: 120 } });
  await page.keyboard.press('n');
  await plot.click({ position: { x: 300, y: 150 } });
  await expect(page.getByTestId('marker-row-1')).toBeVisible();
  for (const [preset, width, height] of [['Paper 1-col', 88.9, 60], ['Paper 2-col', 181.9, 100]] as const) {
    const dialog = await paneExport(page, 1);
    await expect(dialog.getByRole('button', { name: 'This pane' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Screen', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: preset }).click();
    const size = dialog.getByRole('spinbutton', { name: 'Height (mm)' });
    await expect(size).toHaveValue(String(height));
    await expect(dialog.getByRole('checkbox', { name: 'Figure title' })).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: /Copy/ })).toHaveCount(0);
    if (width === 181.9) await size.fill('110');
    await expect(dialog.getByRole('img', { name: /^Export preview/ })).toBeVisible();
    const download = page.waitForEvent('download');
    await expect(dialog.getByRole('button', { name: 'Save PDF' })).toBeEnabled();
    await page.keyboard.press('Enter');
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const pdf = (await readFile(await file.path())).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    const box = /\/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf);
    expect(box).not.toBeNull();
    expect(Number(box?.[1]) * 25.4 / 72).toBeCloseTo(width, 5);
    expect(Number(box?.[2]) * 25.4 / 72).toBeCloseTo(width === 181.9 ? 110 : height, 5);
    expect(pdf).toMatch(/\/BaseFont \/Times-/);
    expect(pdf).toMatch(/\/BaseFont \/Courier\b/);
    expect(pdf).not.toMatch(/\/FontFile|\/Subtype \/Image/);
    if (process.env.P7_EVIDENCE) await file.saveAs(info.outputPath(`paper-${width}.pdf`));
    await expect(dialog).toHaveCount(0);
  }
});

test('the top bar previews the layout and can pick a Table pane for a vector image', async ({ page }) => {
  await openChart(page);
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 2).getByRole('button', { name: /^Table/ }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await expect(page.getByTestId('table-pane-pane-2')).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = exportDialog(page);
  await expect(dialog.getByRole('button', { name: 'All panes', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'SVG', exact: true }).click();
  const preview = dialog.getByRole('img', { name: /^Export preview/ });
  await expect(preview).toBeVisible();
  const drawing = await preview.evaluate(async img => {
    const markup = await (await fetch((img as HTMLImageElement).src)).text();
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    return { panes: [...svg.children].filter(child => child.localName === 'svg').length, legends: svg.querySelectorAll('[data-export-legend]').length };
  });
  expect(drawing).toEqual({ panes: 2, legends: 2 });
  await dialog.getByRole('button', { name: 'Pick…' }).click();
  await dialog.getByRole('checkbox', { name: 'Pane 1' }).uncheck();
  await expect(dialog.getByRole('heading')).toHaveText('Export · Pane 2');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save SVG' }).click();
  const svg = await readFile(await (await download).path(), 'utf8');
  expect(svg).toContain('data-export-table');
  expect(svg).not.toContain('recharts-surface');
});

test('the SVG preview preserves Smith grid and trace stroke widths through transforms', async ({ page }) => {
  await openChart(page);
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 2).getByRole('button', { name: /^Smith/ }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  const dialog = await paneExport(page, 2);
  await dialog.getByRole('button', { name: 'SVG', exact: true }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save SVG' }).click();
  const svg = await readFile(await (await download).path(), 'utf8');
  const strokes = await page.evaluate(source => {
    const root = new DOMParser().parseFromString(source, 'image/svg+xml');
    return ['.smith-grid path', '.smith-trace path'].map(selector => root.querySelector<SVGPathElement>(selector)?.style.getPropertyValue('vector-effect'));
  }, svg);
  expect(strokes).toEqual(['non-scaling-stroke', 'non-scaling-stroke']);
});

test('TikZ shows exact code, notes omitted Smith panes and exports a group with ZIP data', async ({ page }) => {
  await openChart(page);
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(page, 2).getByRole('button', { name: /^Smith/ }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = exportDialog(page);
  await dialog.getByRole('button', { name: 'TikZ', exact: true }).click();
  await dialog.getByRole('button', { name: 'TikZ picture only' }).click();
  await dialog.getByRole('button', { name: 'Paper 2-col' }).click();
  await dialog.getByRole('button', { name: 'Grayscale' }).click();
  await dialog.getByRole('button', { name: '.dat files (ZIP)' }).click();
  await expect(dialog.getByText("Smith panes aren't in TikZ yet")).toBeVisible();
  await expect(dialog.getByText('Approximate preview: LaTeX draws the final figure.')).toBeVisible();
  await dialog.getByRole('tab', { name: 'Code' }).click();
  const text = dialog.locator('pre');
  await expect(text).toContainText('\\usepgfplotslibrary{groupplots}');
  await expect(text).toContainText('\\begin{groupplot}');
  await expect(text).toContainText('\\textwidth');
  await expect(text).toContainText('\\nextgroupplot[group/empty plot');
  await expect(text).not.toContainText('\\begin{figure}');
  expect(await text.textContent()).toMatch(/^% Mergen Scope\n% Preamble:/);
  expect(await text.textContent()).toMatch(/\\definecolor\{msTraceA\w*\}\{RGB\}\{(\d+),\1,\1\}/);
  await expect(dialog.getByRole('button', { name: 'Copy LaTeX' })).toBeEnabled();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save ZIP' }).click();
  const file = await download;
  const zip = await readFile(await file.path());
  expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  expect(zip.toString()).toContain('pane-1-trace-1.dat');
  expect(zip.toString()).toContain('\\begin{tikzpicture}');
});

test('All panes uses per-pane titles and legends, and editing one X title leaves the others alone', async ({ page }) => {
  await page.goto('/app.html?demo=1');
  await expect(pane(page, 3).locator('.recharts-line').first()).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = exportDialog(page);
  const preview = dialog.getByRole('img', { name: /^Export preview/ });
  const inspect = () => preview.evaluate(async img => {
    const svg = new DOMParser().parseFromString(await (await fetch((img as HTMLImageElement).src)).text(), 'image/svg+xml');
    return [...svg.documentElement.children].filter(child => child.localName === 'svg').map(child => ({
      title: child.querySelector('.recharts-xAxis .recharts-label')?.textContent,
      ticks: [...child.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')].map(tick => tick.textContent),
      legend: [...child.querySelectorAll('[data-export-legend-item] text')].map(item => item.textContent),
    }));
  });
  await expect(preview).toBeVisible();
  const before = await inspect();
  expect(before[0]?.title).toBe('Frequency (GHz)');
  expect(before[2]?.title).toBe('Time (ms)');
  expect(before[0]?.legend).toContain('S21 · dB');
  expect(before[0]?.legend).toContain('smoothed · MA 11');
  expect(before[2]?.legend).not.toContain('S21 · dB');
  expect(before.every(panel => panel.legend.length > 0)).toBe(true);
  expect(before.flatMap(panel => panel.ticks).every(tick => /^[-\d.]+$/.test(tick ?? ''))).toBe(true);

  await dialog.getByRole('button', { name: 'Edit per pane' }).click();
  await dialog.getByRole('table').getByRole('textbox', { name: /X title$/ }).first().fill('Sweep frequency');
  await expect.poll(async () => (await inspect())[0]?.title).toBe('Sweep frequency (GHz)');
  const after = await inspect();
  expect(after.slice(1).map(panel => panel.title)).toEqual(before.slice(1).map(panel => panel.title));
  await expect(dialog.getByRole('button', { name: 'Copy image' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'CSV', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Copy data' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Save CSV' })).toBeEnabled();
});

test('Export stays centred, stacks on narrow windows and only closes explicitly', async ({ page }) => {
  await openChart(page);
  const dialog = await paneExport(page, 1);
  for (const [width, height] of [[1440, 900], [680, 620]]) {
    await page.setViewportSize({ width: width!, height: height! });
    const box = (await dialog.boundingBox())!;
    expect(box.x + box.width / 2).toBeCloseTo(width! / 2, 0);
    expect(box.y + box.height / 2).toBeCloseTo(height! / 2, 0);
    expect(box.width).toBeLessThanOrEqual(width! - 64);
    expect(box.height).toBeLessThanOrEqual(height! - 64);
    const preview = (await dialog.getByRole('region', { name: 'Live preview' }).boundingBox())!;
    const settings = (await dialog.getByRole('region', { name: 'Export options' }).boundingBox())!;
    if (width === 680) expect(settings.y).toBeGreaterThan(preview.y);
    else expect(settings.x).toBeGreaterThan(preview.x);
  }
  await page.mouse.click(8, 8);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('import, confirms and About are centred', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  const centered = async () => {
    const dialog = page.getByRole('dialog', { exact: false });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const box = (await dialog.boundingBox())!;
    expect(box.x + box.width / 2).toBeCloseTo(720, 0);
    expect(box.y + box.height / 2).toBeCloseTo(450, 0);
  };
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^About/ }).click();
  await centered();
  await page.keyboard.press('Escape');
  await page.getByTestId('app-open-input').setInputFiles({ name: 'channels.csv', mimeType: 'text/csv', buffer: Buffer.from('Time,CH1,CH2\n0,2,3\n1,3,4\n2,4,5') });
  await expect(page.getByTestId('import-wizard')).toBeVisible();
  await centered();
  await page.goto('/tests/fixtures/phase2/');
  await page.getByRole('button', { name: 'Open dialog' }).click();
  await centered();
});

test('P7 screenshots', async ({ browser }) => {
  test.skip(!process.env.P7_REWORK_SHOTS, 'enable P7_REWORK_SHOTS to write screenshots');
  await mkdir('.scratch', { recursive: true });
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.addInitScript(theme => localStorage.setItem('mergen-theme-preference', theme), theme);
      await page.goto('/app.html?demo=1');
      await expect(pane(page, 3).locator('.recharts-line').first()).toBeVisible();
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const dialog = exportDialog(page);
      const shot = async (name: string) => await page.screenshot({ path: `.scratch/p7-rework-${theme}-${name}.png` });
      if (theme === 'dark') await dialog.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark', exact: true }).click();
      await expect(dialog.getByRole('img')).toBeVisible();
      await shot('png');
      await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
      await dialog.getByRole('button', { name: 'Paper 2-col' }).click();
      await expect(dialog.getByRole('img')).toBeVisible();
      await shot('pdf');
      await dialog.getByRole('button', { name: 'TikZ', exact: true }).click();
      await dialog.getByRole('button', { name: 'Paper 2-col' }).click();
      await expect(dialog.getByText('Approximate preview: LaTeX draws the final figure.')).toBeVisible();
      await shot('tikz-preview');
      await dialog.getByRole('tab', { name: 'Code' }).click();
      await expect(dialog.locator('pre')).toContainText('\\begin{groupplot}');
      await shot('tikz-code');
      if (theme === 'light') {
        const download = page.waitForEvent('download');
        await dialog.getByRole('button', { name: 'Save .tex' }).click();
        await (await download).saveAs('.scratch/p7-rework-all.tex');
      }
    } finally { await page.close(); }
  }
});
