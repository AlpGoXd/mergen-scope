import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Panes start unlinked (11 Nov): tick Pane `to` in Pane `from`'s "Link X with" menu. */
export async function linkX(page: Page, from: number, to: number) {
  await page.getByTestId(`x-link-chip-pane-${from}`).click();
  await page.getByRole('menu', { name: 'Link X with' }).getByRole('menuitemcheckbox', { name: new RegExp(`Pane ${to}\\b`) }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(`x-link-chip-pane-${from}`)).toHaveAttribute('aria-pressed', 'true');
}
