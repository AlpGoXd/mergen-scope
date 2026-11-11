import { expect, test } from '@playwright/test';
import { resolve } from 'path';
import { addAnalysis, analysisCard } from './analysis-helpers';

test('List adds a "V1 crossings" card with only the changing value; it has no Manual threshold button and follows the line', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
  await page.getByRole('button', { name: 'V-Line' }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 120 } });
  const row = page.getByTestId('ref-line-row-V1');
  await row.getByRole('button', { name: 'List…' }).click();
  const card = analysisCard(page, 'V1 crossings');
  await expect(card).toBeVisible();
  // The constant (the line's x) is in the source line, the rows show only y.
  await expect(card.locator('.an-card__source')).toContainText('V1');
  await expect(card.locator('.an-cross__head')).toContainText('Y');
  await expect(card.locator('.an-cross__row').first()).toBeVisible();
  await expect(card).not.toHaveText(/e[+-]\d/i);
  await expect(card.getByRole('button', { name: 'Manual threshold' })).toHaveCount(0);
  const oldSource = await card.locator('.an-card__source').innerText();
  await row.getByRole('button', { name: 'V1 value' }).click();
  await row.getByRole('textbox').fill('1.4204GHz');
  await row.getByRole('textbox').press('Enter');
  await expect.poll(() => card.locator('.an-card__source').innerText()).not.toBe(oldSource);
  // List again does not add a second card.
  await row.getByRole('button', { name: 'List…' }).click();
  await expect(analysisCard(page, 'V1 crossings')).toHaveCount(1);
});

test('the Threshold crossings tool takes a level and lists x values only', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
  const card = await addAnalysis(page, 'Threshold crossings');
  await expect(card.locator('.an-cross__head')).toContainText('X');
  const before = await card.locator('.an-cross__row').count();
  await card.getByLabel('Level').fill('-60');
  await card.getByLabel('Level').press('Enter');
  await expect.poll(() => card.locator('.an-cross__row').count()).not.toBe(before);
});

test.describe('AC-3 card evidence at 2x', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  for (const theme of ['light', 'dark'] as const) {
    test(`line crossing evidence in ${theme}`, async ({ page }) => {
      await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
      await page.goto('/app.html');
      await page.getByTestId('app-open-input').setInputFiles(resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT'));
      await page.getByRole('button', { name: 'V-Line' }).click();
      await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 120 } });
      await page.getByTestId('ref-line-row-V1').getByRole('button', { name: 'List…' }).click();
      const card = analysisCard(page, 'V1 crossings');
      await expect(card).toBeVisible();
      await card.screenshot({ path: `docs/redesign/line-crossings-evidence/${theme}-line.png` });
      await page.screenshot({ path: `docs/redesign/line-crossings-evidence/${theme}.png` });
      const manual = await addAnalysis(page, 'Threshold crossings');
      await manual.screenshot({ path: `docs/redesign/line-crossings-evidence/${theme}-manual.png` });
    });
  }
});
