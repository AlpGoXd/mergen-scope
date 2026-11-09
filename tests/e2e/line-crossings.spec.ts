import { expect, test } from '@playwright/test';
import { resolve } from 'path';

test('List opens live line intersections and manual threshold remains available', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
  await page.getByRole('button', {name: 'V-Line'}).click();
  await page.getByTestId('chart-plot-pane-1').click({position: {x: 260, y: 120}});
  const row = page.getByTestId('ref-line-row-V1');
  await row.getByRole('button', {name: 'List…'}).click();
  const card = page.getByTestId('analysis-card-threshold-crossings');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Vertical line');
  await expect(card).toContainText('x=');
  await expect(card).not.toHaveText(/e[+-]\d/i);
  const oldText = await card.innerText();
  await row.getByRole('textbox').fill('1.4204GHz');
  await row.getByRole('textbox').press('Enter');
  await expect.poll(() => card.innerText()).not.toBe(oldText);
  await card.getByRole('button', {name: 'Manual threshold'}).click();
  await expect(card.getByLabel('Threshold', { exact: true })).toBeVisible();
});


test.describe('AC-3 card evidence at 2x', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  for (const theme of ['light', 'dark'] as const) {
    test(`line crossing evidence in ${theme}`, async ({ page }) => {
      await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
      await page.goto('/app.html');
      await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
      await page.getByRole('button', {name: 'V-Line'}).click();
      await page.getByTestId('chart-plot-pane-1').click({position: {x: 260, y: 120}});
      await page.getByTestId('ref-line-row-V1').getByRole('button', {name: /^List/}).click();
      const card = page.getByTestId('analysis-card-threshold-crossings');
      await expect(card).toBeVisible();
      await card.screenshot({path: `docs/redesign/line-crossings-evidence/${theme}-line.png`});
      await page.screenshot({path: `docs/redesign/line-crossings-evidence/${theme}.png`});
      await card.getByRole('button', {name: 'Manual threshold'}).click();
      await expect(card.getByLabel('Threshold', { exact: true })).toBeVisible();
      await card.screenshot({path: `docs/redesign/line-crossings-evidence/${theme}-manual.png`});
    });
  }
});
