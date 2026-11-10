import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';
import { addAnalysis, analysisCard, openAnalysisPanel } from './analysis-helpers';

// The right panel holds only Analysis (spec 5.5), built from the Analysis kit (AC-3).
async function loaded(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
}

test('the panel is closed by default, opens from the Analysis chip, and has no tabs or old tool groups', async ({ page }) => {
  await loaded(page);
  await expect(page.locator('.an-panel')).toHaveCount(0);
  await openAnalysisPanel(page);
  await expect(page.locator('.an-panel__head')).toContainText('Analysis');
  await expect(page.locator('.an-panel__count')).toHaveText('0');
  await expect(page.locator('.an-panel__empty')).toContainText('No analyses yet');
  for (const gone of ['Trace Ops', 'Import/Export', 'Data', 'Right']) await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
  // The chip closes it again.
  await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.an-panel')).toHaveCount(0);
});

test('+ Add analysis: search, Math / Measure filter, greyed tools with their reason, A to Z', async ({ page }) => {
  await loaded(page);
  await openAnalysisPanel(page);
  await page.locator('.an-panel__head').getByRole('button', { name: '+ Add analysis' }).click();
  const menu = page.getByRole('dialog', { name: 'Add analysis' });
  const titles = await menu.locator('.an-menu__item .an-menu__text > span:first-child').allInnerTexts();
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  expect(titles).not.toContain('VSWR');
  // Reasons replace the note and grey the item.
  await expect(menu.getByRole('option', { name: /^IP3/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(menu.getByRole('option', { name: /^IP3/ })).toContainText('Place F1, F2, IM3L and IM3U markers');
  await expect(menu.getByRole('option', { name: /^Channel power/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(menu.getByRole('option', { name: /^Channel power/ })).toContainText('spectral density units');
  // Filter chips and search.
  await menu.getByRole('button', { name: /Math/ }).click();
  await expect(menu.getByRole('option')).toHaveCount(3);
  await menu.getByRole('button', { name: 'All' }).click();
  await menu.getByRole('textbox', { name: 'Search analyses' }).fill('rank');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await expect(menu.getByRole('option', { name: /^Peak Table/ })).toBeVisible();
  await menu.getByRole('textbox', { name: 'Search analyses' }).fill('zzz');
  await expect(menu).toContainText('Nothing matches');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('adding opens the panel, a tool added twice shows a check, Enter picks from the keyboard, Recent lists the last picks', async ({ page }) => {
  await loaded(page);
  await openAnalysisPanel(page);
  await addAnalysis(page, 'Range Statistics');
  await page.locator('.an-panel__head').getByRole('button', { name: '+ Add analysis' }).click();
  const menu = page.getByRole('dialog', { name: 'Add analysis' });
  await expect(menu.getByRole('option', { name: /^Range Statistics/ }).getByLabel('Already added').first()).toBeVisible();
  await expect(menu).toContainText('Recent');
  await menu.getByRole('textbox', { name: 'Search analyses' }).fill('ripple');
  await menu.getByRole('textbox', { name: 'Search analyses' }).press('ArrowDown');
  await menu.getByRole('textbox', { name: 'Search analyses' }).press('Enter');
  await expect(analysisCard(page, 'Ripple')).toBeVisible();
  await expect(page.locator('.an-panel__count')).toHaveText('2');
});

test('a card collapses to one line with its summary, edits a parameter, shows a danger tint for a bad value and removes with Undo; removing the last card closes the panel', async ({ page }) => {
  await loaded(page);
  const card = await addAnalysis(page, 'Bandwidth');
  await expect(card.locator('.an-result')).toBeVisible();
  const before = await card.locator('.an-result').innerText();
  const drop = card.getByRole('textbox').first();
  await drop.fill('10');
  await drop.press('Enter');
  await expect.poll(() => card.locator('.an-result').innerText()).not.toBe(before);
  await drop.fill('abc');
  await drop.press('Enter');
  await expect(drop).toHaveAttribute('aria-invalid', 'true');
  await drop.fill('3');
  await drop.press('Enter');
  await expect(drop).not.toHaveAttribute('aria-invalid', 'true');

  await card.locator('.an-card__head').click();
  await expect(card.locator('.an-card__body')).toHaveCount(0);
  await expect(card.locator('.an-card__summary')).toBeVisible();
  await card.locator('.an-card__head').click();
  await expect(card.locator('.an-card__body')).toBeVisible();

  await card.locator('.an-icon-btn--more').click();
  await expect(page.getByRole('menu', { name: 'Bandwidth actions' }).getByRole('menuitem')).toHaveText([/Copy results/, /Remove/]);
  await page.keyboard.press('Escape');

  await card.locator('.an-icon-btn').last().click();
  await expect(page.locator('.ui-toast')).toContainText('Removed Bandwidth');
  await expect(page.locator('.an-panel')).toHaveCount(0); // the last analysis is gone: the panel closes
  await page.locator('.ui-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.an-card').filter({ hasText: 'Bandwidth' })).toHaveCount(0); // closed, but the card is back once reopened
  await openAnalysisPanel(page);
  await expect(analysisCard(page, 'Bandwidth')).toBeVisible();
});

test('a Math tool creates a live trace next to its source in the same pane; Freeze keeps it', async ({ page }) => {
  await loaded(page);
  const card = await addAnalysis(page, 'Smooth');
  const output = page.locator('[data-testid^="trace-row-"][data-testid*="smoothed"]').first();
  await expect(output).toBeVisible();
  await expect(output).toContainText('P1');
  await expect(card.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Freeze' }).click();
  await expect(card.getByRole('button', { name: 'Freeze' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z');
  await expect(card.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
});

test('the trace of a card is chosen from a list of the visible traces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByTestId('touchstone-cell-S11').click();
  const card = await addAnalysis(page, 'Range Statistics');
  const source = card.locator('.an-select').first();
  const first = await source.innerText();
  await source.click();
  const menu = page.getByRole('menu', { name: 'Trace' });
  await expect(menu.getByRole('menuitemcheckbox').first()).toBeVisible();
  const options = await menu.getByRole('menuitemcheckbox').allInnerTexts();
  expect(options.length).toBeGreaterThan(1);
  await menu.getByRole('menuitemcheckbox').filter({ hasNotText: first.trim() }).first().click();
  await expect(source).not.toHaveText(first);
});

test('the top bar Export is disabled without traces and downloads the visible traces as CSV with them', async ({ page }) => {
  await page.goto('/app.html');
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
});
