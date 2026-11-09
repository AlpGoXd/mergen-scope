import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
for (const theme of ['dark', 'light'] as const) {
  test(`matrix states in ${theme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.goto('/app.html');
    await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
    const selected = page.getByTestId('touchstone-cell-S11');
    const empty = page.getByTestId('touchstone-cell-S12');
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    // Compare resolved CSS colors using a probe to accommodate oklch tokens.
    const colors = await empty.evaluate((el, theme) => { const probe = document.createElement('span'); probe.style.backgroundColor = `var(${'--bg'})`; el.appendChild(probe); const result = [getComputedStyle(el).backgroundColor, getComputedStyle(probe).backgroundColor]; probe.remove(); return result; }, theme);
    expect(colors[0]).toBe(colors[1]);
    await page.screenshot({ path: `docs/redesign/dark-matrix-2x-evidence/${theme}-app.png` });
    const matrix = page.getByTestId('matrix-controls');
    const more = page.getByRole('button', { name: 'More network views' });
    await matrix.screenshot({ path: `docs/redesign/dark-matrix-2x-evidence/${theme}-matrix.png` });
    const isContained = () => more.evaluate(el => { const bounds = el.getBoundingClientRect(); const matrixBounds = el.closest('[data-testid=matrix-controls]')!.getBoundingClientRect(); return bounds.left >= matrixBounds.left && bounds.right <= matrixBounds.right && el.scrollWidth <= el.clientWidth; });
    expect(await isContained()).toBe(true);
    const traceColor = await selected.evaluate(el => getComputedStyle(el).borderTopColor);
    await page.getByRole('button', { name: 'Phase', exact: true }).click();
    const dot = selected.getByLabel('Also plotted elsewhere or in another view');
    await expect(dot).toBeVisible();
    const dotColor = await dot.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(dotColor).toBe(traceColor);
    await matrix.screenshot({ path: `docs/redesign/dark-matrix-2x-evidence/${theme}-phase.png` });
    await page.setViewportSize({ width: 1024, height: 640 });
    const handle = await page.getByRole('separator', { name: 'Resize left panel' }).boundingBox();
    if (!handle) throw new Error('Resize handle missing');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
    await page.mouse.down();
    await page.mouse.move(220, handle.y + 100);
    await page.mouse.up();
    expect(await isContained()).toBe(true);
    await matrix.screenshot({ path: `docs/redesign/dark-matrix-2x-evidence/${theme}-narrow.png` });
  });
}
