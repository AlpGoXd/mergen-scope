import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Clear workspace… from the Files ⋯ menu in the left panel (it moved there from the top bar's Clear All). */
export async function clearWorkspace(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Files actions' }).click();
  await page.getByRole('menuitem', { name: 'Clear workspace…' }).click();
}

/** The app's own confirmation dialog (stores/dialog-store.tsx), not a browser prompt. */
export const appDialog = (page: Page) => page.getByRole('dialog').filter({ has: page.getByTestId('app-dialog-body') });

/** Wait for the app dialog, click one of its buttons and return the text it showed. */
export async function answerAppDialog(page: Page, button: string): Promise<string> {
  const dialog = appDialog(page);
  await expect(dialog).toBeVisible();
  const text = await dialog.innerText();
  await dialog.getByRole('button', { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return text;
}

/** For steps that ask only when work is open: answer the dialog if it appears within `ms`. */
export async function answerAppDialogIfShown(page: Page, button: string, ms = 2000): Promise<boolean> {
  const shown = await appDialog(page).waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
  if (shown) await answerAppDialog(page, button);
  return shown;
}
