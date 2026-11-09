import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

// Evidence capture for the AC-3 cards, row spacing and Size setting. Writes PNGs only when AC3_CAPTURE is set.
const capture = process.env.AC3_CAPTURE;
const dir = 'docs/redesign/ac3-size-evidence';

async function setup(page: Page, theme: 'light' | 'dark', size: string, viewport: { width: number; height: number }) {
  await page.addInitScript(([t, s]) => { localStorage.setItem('mergen-theme-preference', t); localStorage.setItem('mergen-app-preferences', JSON.stringify({ size: s })); }, [theme, size] as const);
  await page.setViewportSize(viewport);
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-size', size);
}

test.use({ deviceScaleFactor: 2 });

for (const theme of ['light', 'dark'] as const) {
  test(`AC-3 cards, rows and sizes in ${theme}`, async ({ page }) => {
    test.skip(!capture, 'set AC3_CAPTURE=1 to write evidence');
    await setup(page, theme, 'comfortable', { width: 1440, height: 900 });
    await page.getByRole('button', { name: 'New Marker', exact: true }).click();
    await page.getByTestId('chart-plot-pane-1').click({ position: { x: 300, y: 120 } });
    await page.getByRole('button', { name: 'V-Line' }).click();
    await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 120 } });
    const rightButton = page.getByRole('button', { name: 'Right' });
    if (await rightButton.isVisible().catch(() => false)) await rightButton.click();
    await page.getByRole('button', { name: 'Range Statistics' }).click();
    await page.getByRole('button', { name: 'Compute Stats' }).click();
    await page.getByRole('button', { name: 'Ripple / Flatness' }).click();
    await page.getByRole('button', { name: 'Compute Ripple' }).click();
    await page.getByTestId('ref-line-row-V1').getByRole('button', { name: /^List/ }).click();
    await expect(page.getByTestId('analysis-card-threshold-crossings')).toBeVisible();
    await page.screenshot({ path: `${dir}/${theme}-app.png` });
    await page.locator('.lp').first().screenshot({ path: `${dir}/${theme}-left.png` });
    await page.getByTestId('analysis-card-range-statistics').screenshot({ path: `${dir}/${theme}-card-range.png` });
    await page.getByTestId('analysis-card-ripple-flatness').screenshot({ path: `${dir}/${theme}-card-ripple.png` });
    await page.getByTestId('analysis-card-analysis-menu').screenshot({ path: `${dir}/${theme}-panel-header.png` });
    for (const size of ['compact', 'large'] as const) {
      await page.evaluate((s) => { document.documentElement.dataset.size = s; }, size);
      await page.screenshot({ path: `${dir}/${theme}-app-${size}.png` });
    }
    await page.evaluate(() => { document.documentElement.dataset.size = 'comfortable'; });
    await page.setViewportSize({ width: 1024, height: 640 });
    await page.screenshot({ path: `${dir}/${theme}-narrow-1024.png` });
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`file card summary line in ${theme}`, async ({ page }) => {
    test.skip(!capture, 'set AC3_CAPTURE=1 to write evidence');
    await page.addInitScript((t) => { localStorage.setItem('mergen-theme-preference', t); }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html');
    await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
    await expect(page.locator('.lp-file__summary').first()).toBeVisible();
    await page.locator('.lp').first().screenshot({ path: `${dir}/${theme}-left-network.png` });
  });
}
