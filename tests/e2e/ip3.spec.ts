import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';
import { addAnalysis } from './analysis-helpers';

async function loaded(page: Page, file = 'cascade_ip3_-12dBm.DAT') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve(`test files/${file}`));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
}

const tags = (page: Page) => page.locator('[data-testid^="marker-row-"] .lp-tag');

test('IP3 can be added without markers, explains what is missing and Auto-place markers fills it in', async ({ page }) => {
  await loaded(page);
  const card = await addAnalysis(page, 'IP3');
  await expect(card).toContainText('Place F1, F2, IM3L and IM3U markers');
  await expect(tags(page)).toHaveCount(0);
  await card.getByRole('button', { name: 'Auto-place markers' }).click();
  await expect(tags(page)).toHaveText(['F1', 'F2', 'IM3L', 'IM3U']);
  await expect(card).not.toContainText('Place F1, F2, IM3L and IM3U markers');
  await expect(card).toContainText('OIP3');
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  // One Undo step removes all four and the message is back.
  await page.locator('.an-output__note, .an-panel__head').first().click();
  await page.keyboard.press('Control+z');
  await expect(tags(page)).toHaveCount(0);
  await expect(card).toContainText('Place F1, F2, IM3L and IM3U markers');
});

test('the card menu has Auto-place markers and replaces earlier role markers', async ({ page }) => {
  await loaded(page, 'cascade_ip3_-15dBm.DAT');
  const card = await addAnalysis(page, 'IP3');
  await card.locator('.an-icon-btn--more').click();
  await page.getByRole('menu', { name: 'IP3 actions' }).getByRole('menuitem', { name: 'Auto-place markers' }).click();
  await expect(tags(page)).toHaveText(['F1', 'F2', 'IM3L', 'IM3U']);
  await card.locator('.an-icon-btn--more').click();
  await page.getByRole('menu', { name: 'IP3 actions' }).getByRole('menuitem', { name: 'Auto-place markers' }).click();
  await expect(tags(page)).toHaveCount(4);
});

test('a marker row has a Role menu: a role moves from one marker to another and can be cleared', async ({ page }) => {
  await loaded(page);
  const card = await addAnalysis(page, 'IP3');
  await card.getByRole('button', { name: 'Auto-place markers' }).click();
  await expect(tags(page)).toHaveText(['F1', 'F2', 'IM3L', 'IM3U']);
  const row = (n: number) => page.getByTestId(`marker-row-${n}`);
  await row(2).getByRole('button', { name: /^Role F2/ }).click();
  await page.getByRole('menuitem', { name: 'F1', exact: false }).first().click();
  await expect(tags(page).nth(1)).toHaveText('F1');
  await expect(tags(page).nth(0)).toHaveText('M1');
  await expect(card).toContainText('Place F1, F2, IM3L and IM3U markers');
  await row(2).getByRole('button', { name: /^Role F1/ }).click();
  await page.getByRole('menuitem', { name: 'Clear role' }).click();
  await expect(tags(page).nth(1)).toHaveText('M2');
});
