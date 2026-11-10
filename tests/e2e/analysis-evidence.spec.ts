import { expect, test } from '@playwright/test';
import { resolve } from 'path';
import { addAnalysis, analysisCard } from './analysis-helpers';

// Evidence capture for the Analysis panel built from the kit. Writes PNGs only when ANALYSIS_CAPTURE is set.
const capture = process.env.ANALYSIS_CAPTURE;
const dir = 'docs/redesign/analysis-evidence';
test.use({ deviceScaleFactor: 2 });

for (const theme of ['light', 'dark'] as const) {
  test(`analysis panel in ${theme}`, async ({ page }) => {
    test.skip(!capture, 'set ANALYSIS_CAPTURE=1 to write evidence');
    await page.addInitScript((t) => { localStorage.setItem('mergen-theme-preference', t); }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html');
    await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
    await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Analysis', exact: true }).click();
    await page.screenshot({ path: `${dir}/${theme}-empty.png` });
    await addAnalysis(page, 'Bandwidth');
    await addAnalysis(page, 'Range Statistics');
    await addAnalysis(page, 'Smooth');
    await addAnalysis(page, 'Threshold crossings');
    await page.getByRole('button', { name: 'V-Line' }).click();
    await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 120 } });
    await page.getByTestId('ref-line-row-V1').getByRole('button', { name: /^List/ }).click();
    await analysisCard(page, 'Range Statistics').locator('.an-card__head').click();
    await page.screenshot({ path: `${dir}/${theme}-app.png` });
    await page.locator('.an-panel').screenshot({ path: `${dir}/${theme}-panel.png` });
    await page.locator('.an-panel__head').getByRole('button', { name: '+ Add analysis' }).click();
    await page.getByRole('dialog', { name: 'Add analysis' }).screenshot({ path: `${dir}/${theme}-add-menu.png`, animations: 'disabled' });
  });
}
