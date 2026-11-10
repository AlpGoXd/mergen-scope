import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Opens the right panel through the top-bar Analysis chip (it holds only Analysis). */
export async function openAnalysisPanel(page: Page): Promise<void> {
  if (!(await page.locator('.an-panel').isVisible().catch(() => false))) await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.an-panel')).toBeVisible();
}

/** The card whose title starts with `title`. */
export function analysisCard(page: Page, title: string | RegExp): Locator {
  return page.locator('.an-card').filter({ has: page.locator('.an-card__title', { hasText: title }) });
}

/** "+ Add analysis", pick the tool by title, and return its card. */
export async function addAnalysis(page: Page, title: string): Promise<Locator> {
  await openAnalysisPanel(page);
  await page.locator('.an-panel__head').getByRole('button', { name: '+ Add analysis' }).click();
  await page.getByRole('option', { name: new RegExp(`^${title}`) }).click();
  const card = analysisCard(page, title);
  await expect(card.first()).toBeVisible();
  return card.first();
}
