import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
for (const theme of ['dark', 'light'] as const) {
  test(`matrix states in ${theme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.goto('/app.html');
    await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
    const selected = page.getByTestId('touchstone-cell-S11');
    const empty = page.getByTestId('touchstone-cell-S12');
    await expect(selected.locator('.lp-cell__count')).toHaveText('1');
    // Compare resolved CSS colors using a probe to accommodate oklch tokens.
    const colors = await empty.evaluate(el => { const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--raised)'; el.appendChild(probe); const result = [getComputedStyle(el).backgroundColor, getComputedStyle(probe).backgroundColor]; probe.remove(); return result; });
    expect(colors[0]).toBe(colors[1]);
    await page.screenshot({ path: `docs/redesign/dark-matrix-2x-evidence/${theme}-app.png` });
    const matrix = page.getByTestId('matrix-controls');
    const more = page.getByRole('button', { name: 'More network views' });
    await matrix.screenshot({ path: `docs/redesign/dark-matrix-2x-evidence/${theme}-matrix.png` });
    const isContained = () => more.evaluate(el => { const bounds = el.getBoundingClientRect(); const matrixBounds = el.closest('[data-testid=matrix-controls]')!.getBoundingClientRect(); return bounds.left >= matrixBounds.left && bounds.right <= matrixBounds.right && el.scrollWidth <= el.clientWidth; });
    expect(await isContained()).toBe(true);
    await page.getByRole('button', { name: 'Phase', exact: true }).click();
    await expect(selected.locator('.lp-cell__count')).toHaveText('1');
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

test('high contrast makes matrix diagonals and incompatible Smith cells distinct', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await page.getByTestId('chart-pane-pane-2').locator('.ptp-tile').filter({ hasText: 'Smith' }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'App settings' });
  await settings.getByRole('button', { name: 'High', exact: true }).click();
  await settings.getByRole('button', { name: 'Close settings' }).click();

  const diagonal = page.getByTestId('touchstone-cell-S22');
  await expect(diagonal).toHaveCSS('border-top-width', '2px');
  await expect(diagonal).toHaveCSS('font-weight', '700');
  await expect(diagonal).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const selected = page.getByTestId('touchstone-cell-S11');
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await expect(selected).toHaveCSS('background-color', 'oklch(1 0.001 255)');
  await expect(selected.locator('.lp-cell__count')).toHaveCSS('background-color', 'oklch(0.12 0.007 255)');
  const blocked = page.getByTestId('touchstone-cell-S21');
  await expect(blocked).toBeDisabled();
  await expect(blocked).toHaveAttribute('title', /Smith/i);
  await expect(blocked).toHaveCSS('background-image', /repeating-linear-gradient/);
  await expect(blocked).toHaveCSS('border-top-style', 'dashed');
  await expect(blocked).toHaveCSS('text-decoration-line', 'line-through');
  await expect(page.getByTestId('chart-pane-pane-2').locator('..')).toHaveCSS('box-shadow', 'none');
  await expect(page.getByTestId('chart-pane-header-pane-2')).toHaveCSS('background-color', 'oklch(0.12 0.007 255)');
});
