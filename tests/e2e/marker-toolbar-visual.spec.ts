import { test, expect } from '@playwright/test';
import { resolve } from 'path';

for (const theme of ['light', 'dark'] as const) {
  test(`toolbar retains group positions while armed in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(process.env.MARKER_TOOLBAR_BASE_URL ?? '/app.html');
    const capture = async (state: string) => {
      if (process.env.MARKER_TOOLBAR_CAPTURE) await page.screenshot({ path: `docs/redesign/marker-toolbar-visual-evidence/${theme}-${state}.png`, animations: 'disabled' });
    };
    await capture('empty');
    await page.getByTestId('app-open-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
    await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
    await capture('populated');
    const controls = page.getByRole('button', { name: 'New Marker', exact: true });
    const search = page.getByRole('button', { name: 'Peak', exact: true });
    const before = await search.boundingBox();
    const paneGroup = page.getByRole('button', { name: '+ Pane', exact: true });
    expect((await paneGroup.boundingBox())?.y).toBe(before?.y);
    await controls.click();
    await expect(controls).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Click to place a marker', { exact: true }).first()).toBeVisible();
    expect(await search.boundingBox()).toEqual(before);
    await capture('armed');
    await page.keyboard.press('Escape');
    await expect(controls).toHaveAttribute('aria-pressed', 'false');
    expect(await search.boundingBox()).toEqual(before);
    const pane = page.getByRole('button', { name: '+ Pane', exact: true });
    const paneBefore = await pane.boundingBox();
    await page.getByRole('button', { name: 'V-Line', exact: true }).click();
    expect(await pane.boundingBox()).toEqual(paneBefore);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'V-Line', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(await pane.boundingBox()).toEqual(paneBefore);
  });
}

