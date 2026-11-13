import { expect, test } from '@playwright/test';
import { resolve } from 'path';

// Evidence capture for the lines presentation (kit/lines vs board 37-P4c). Writes PNGs only when LINES_CAPTURE is set.
const capture = process.env.LINES_CAPTURE;
const dir = 'docs/redesign/lines-evidence';
test.use({ deviceScaleFactor: 2 });

for (const theme of ['light', 'dark'] as const) {
  test(`lines presentation in ${theme}`, async ({ page }) => {
    test.skip(!capture, 'set LINES_CAPTURE=1 to write evidence');
    await page.addInitScript((t) => { localStorage.setItem('mergen-theme-preference', t); }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html');
    await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
    await page.getByRole('button', { name: '+ Pane', exact: true }).click();
    const trace = page.locator('[data-testid^="trace-row-"]').first();
    await trace.getByTitle('Show in panes').click();
    await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'V-Line' }).click();
    await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 60 } });
    await page.getByRole('button', { name: 'H-Line' }).click();
    await page.getByTestId('chart-plot-pane-1').click({ position: { x: 300, y: 140 } });
    const v1 = page.getByTestId('ref-line-row-V1');
    await v1.getByRole('button', { name: 'V1: Show in…' }).click();
    await page.getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
    await page.keyboard.press('Escape');
    await expect(v1).toContainText('Shown in P1, P2');
    await page.getByTestId('ref-line-row-V1').locator('.ln-row').hover();
    await page.screenshot({ path: `${dir}/${theme}-app-hover-row.png` });
    await page.locator('.lp').first().screenshot({ path: `${dir}/${theme}-left.png` });
    await page.getByTestId('chart-plot-pane-1').screenshot({ path: `${dir}/${theme}-pane-1.png` });
    await page.getByTestId('chart-plot-pane-2').screenshot({ path: `${dir}/${theme}-pane-2.png` });
    await page.getByTestId('ref-line-row-V1').getByRole('button', { name: /Show in/ }).click();
    await page.getByRole('menu', { name: 'Show in' }).screenshot({ path: `${dir}/${theme}-show-in.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByTestId('chart-plot-pane-1').locator('.ln-label').first().click({ button: 'right' });
    await page.getByRole('menu', { name: 'V1 line' }).screenshot({ path: `${dir}/${theme}-context-menu.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
    // edge tag: zoom X into the right part of pane 1
    const plot = await page.getByTestId('chart-plot-pane-1').boundingBox();
    if (!plot) throw new Error('no plot');
    const y = plot.y + plot.height / 2;
    await page.mouse.move(plot.x + plot.width * 0.7, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(plot.x + plot.width * 0.9, y, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await expect(page.getByTestId('chart-plot-pane-1').locator('.ln-edge').first()).toBeVisible();
    await page.getByTestId('chart-plot-pane-1').screenshot({ path: `${dir}/${theme}-pane-edge-tag.png` });
    await page.getByTestId('ref-line-row-V1').getByRole('button', { name: 'Delete V1' }).click();
    await page.getByTestId('ref-line-row-H1').screenshot({ path: `${dir}/${theme}-row-h.png` });
  });
}
