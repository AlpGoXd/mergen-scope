import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { acceptImport } from './import-helpers';
import { addAnalysis } from './analysis-helpers';

const S2P = resolve('test files/cascaded chain.s2p');
const SCOPE = resolve('test files/scope_1khz_sine_100ksps.csv');
const rows = (page: Page) => page.locator('[data-testid^="trace-row-"]');
const plot = (page: Page, pane: string) => page.getByTestId(`chart-plot-${pane}`);

/** Select the scope trace, add FFT and create its trace. */
async function createFft(page: Page, source: string | RegExp) {
  await rows(page).filter({ hasText: source }).first().click({ position: { x: 60, y: 8 } });
  const card = await addAnalysis(page, 'FFT');
  await card.getByRole('button', { name: 'Create trace' }).click();
  const row = rows(page).filter({ hasText: /^.*FFT · /i }).first();
  await expect(row).toBeVisible();
  return row;
}

/** The FFT's pane shows samples inside its plot: its X ticks are in the kHz range and nothing says it is empty. */
async function expectSpectrumInView(page: Page, pane: string) {
  await expect(plot(page, pane)).not.toContainText('No visible traces');
  await expect.poll(async () => (await plot(page, pane).locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents()).join(' ')).toMatch(/\dk\b|kHz/);
}

test('nothing overlaps the spectrum: Create trace makes a new, unlinked chart pane for it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(S2P);
  await page.getByTestId('touchstone-cell-S21').click();
  // Zoom pane 1 to the GHz band, so its visible range no longer reaches 0–50 kHz.
  const box = await plot(page, 'pane-1').boundingBox(); if (!box) throw new Error('no plot');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2); await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 6 }); await page.mouse.up({ button: 'right' });
  await page.getByTestId('app-open-input').setInputFiles(SCOPE); await acceptImport(page);
  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  const row = await createFft(page, 'scope_1khz');
  await expect(page.getByTestId('chart-pane-pane-3')).toBeVisible();
  await expect(row.getByTitle('Show in panes')).toContainText('P3');
  await expect(page.getByTestId('chart-pane-header-pane-3').getByRole('button', { name: /^X link/ })).toHaveAttribute('aria-label', /not linked/);
  await expect(page.getByTestId('chart-pane-header-pane-3').getByRole('button', { name: /^Chart type: Chart/ })).toBeVisible();
  await expectSpectrumInView(page, 'pane-3');
});

test('a frequency pane whose visible range overlaps the spectrum takes it', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(S2P); // 10 kHz – 8.5 GHz, not zoomed
  await page.getByTestId('app-open-input').setInputFiles(SCOPE); await acceptImport(page);
  const row = await createFft(page, 'scope_1khz');
  await expect(row.getByTitle('Show in panes')).toContainText('P1');
  await expect(page.getByTestId('chart-pane-pane-3')).toHaveCount(0);
  await expect(plot(page, 'pane-1')).not.toContainText('No visible traces');
});

test('at the pane limit (demo) it joins the nearest frequency pane and fits its X to the spectrum', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Load demo' }).click();
  await expect(rows(page).first()).toBeVisible();
  await expect(page.locator('[data-testid^="chart-pane-pane-"]')).toHaveCount(4);
  const row = await createFft(page, 'signal_1khz');
  await expect(page.locator('[data-testid^="chart-pane-pane-"]')).toHaveCount(4);
  // S21 Gain (pane 1, zoomed to GHz) is nearer to 0–50 kHz than Two-Tone (1.42 GHz).
  await expect(row.getByTitle('Show in panes')).toContainText('P1');
  await expectSpectrumInView(page, 'pane-1');
});
