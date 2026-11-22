import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

// Measure only after the web fonts are in and every CSS transition or animation has finished: under a loaded
// machine the first measurement could otherwise use fallback-font metrics or catch a chip mid-transition.
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(document.getAnimations().map(animation => animation.finished));
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`toolbar retains group positions while armed in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    // Wide enough for all four open groups on one row (narrower windows wrap whole groups to a second line).
    await page.setViewportSize({ width: 2048, height: 900 });
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
    await settle(page);
    const before = await search.boundingBox();
    const paneGroup = page.getByRole('button', { name: '+ Pane', exact: true });
    expect((await paneGroup.boundingBox())?.y).toBe(before?.y);
    await controls.click();
    await expect(controls).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('footer-sentence')).toHaveText('Placing M1 · click a trace · Esc cancels');
    await settle(page);
    expect(await search.boundingBox()).toEqual(before);
    await capture('armed');
    await page.keyboard.press('Escape');
    await expect(controls).toHaveAttribute('aria-pressed', 'false');
    await settle(page);
    expect(await search.boundingBox()).toEqual(before);
    const pane = page.getByRole('button', { name: '+ Pane', exact: true });
    const paneBefore = await pane.boundingBox();
    await page.getByRole('button', { name: 'V-Line', exact: true }).click();
    await settle(page);
    expect(await pane.boundingBox()).toEqual(paneBefore);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'V-Line', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await settle(page);
    expect(await pane.boundingBox()).toEqual(paneBefore);
  });
}

