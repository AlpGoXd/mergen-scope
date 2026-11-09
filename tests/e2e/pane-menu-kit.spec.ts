import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ deviceScaleFactor: 2 });

for (const theme of ['light', 'dark'] as const) {
  test(`Show in checklist preserves placement and undo in ${theme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html');
    await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
    await page.getByRole('button', { name: '+ Pane', exact: true }).click();
    const row = page.locator('[data-testid^="trace-row-"]').first();
    await row.getByTitle('Show in panes').click();
    const menu = row.getByRole('menu', { name: 'Show in' });
    await expect(menu).toBeVisible();
    await expect(menu.locator('.lp-menu__title')).toHaveText('Show in');
    const pane1 = menu.getByRole('menuitemcheckbox', { name: 'Pane 1' });
    const pane2 = menu.getByRole('menuitemcheckbox', { name: 'Pane 2' });
    await expect(pane1).toBeChecked();
    await expect(pane2).not.toBeChecked();
    await pane2.click();
    await expect(pane2).toBeChecked();
    await expect(row.getByTitle('Show in panes')).toContainText('P2');
    if (process.env.PANE_MENU_CAPTURE) await menu.screenshot({ path: `docs/redesign/pane-menu-evidence/${theme}.png`, scale: 'device', animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await row.getByTitle('Show in panes').click();
    await expect(pane2).not.toBeChecked();
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`incompatible pane explains why it cannot be selected in ${theme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html');
    await page.getByTestId('empty-chart-file-input').setInputFiles({ name: 'time.csv', mimeType: 'text/csv', buffer: Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
    await page.keyboard.press('2');
    await page.getByTestId('chart-pane-pane-2').evaluate(target => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['Frequency (Hz),Magnitude (dBm)\n100,1\n200,2\n300,3\n'], 'frequency.csv', { type: 'text/csv' }));
      for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
    });
    const row = page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'time.csv' }).first();
    await expect(page.getByTestId('chart-plot-pane-2')).toBeVisible();
    await row.getByTitle('Show in panes').click();
    const menu = row.getByRole('menu', { name: 'Show in' });
    const item = menu.getByRole('menuitemcheckbox').nth(1);
    const reason = 'Cannot assign a time-domain trace to a pane containing frequency-domain traces.';
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await expect(item).toHaveAttribute('title', reason);
    await expect(item).toContainText(reason);
    await item.dispatchEvent('click');
    await expect(item).not.toBeChecked();
    await page.mouse.move(1000, 100);
    if (process.env.PANE_MENU_CAPTURE) await menu.screenshot({ path: `docs/redesign/pane-menu-evidence/${theme}-incompatible.png`, scale: 'device', animations: 'disabled' });
  });
}


test('New pane creates and assigns in one undoable action and respects the limit', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  const row = page.locator('[data-testid^="trace-row-"]').first();
  await row.getByTitle('Show in panes').click();
  const menu = row.getByRole('menu', { name: 'Show in' });
  await expect(menu.getByRole('menuitemcheckbox', { name: /Pane 1.*Chart/ })).toBeChecked();
  await menu.getByRole('menuitem', { name: 'New pane' }).click();
  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  await expect(row.getByTitle('Show in panes')).toContainText('P2');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('chart-pane-pane-2')).toHaveCount(0);
  await expect(row.getByTitle('Show in panes')).not.toContainText('P2');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('chart-pane-pane-2')).toBeVisible();
  await expect(row.getByTitle('Show in panes')).toContainText('P2');
  await row.getByTitle('Show in panes').click();
  await menu.getByRole('menuitem', { name: 'New pane' }).click();
  await menu.getByRole('menuitem', { name: 'New pane' }).click();
  const newPane = menu.getByRole('menuitem', { name: 'New pane' });
  await expect(newPane).toHaveAttribute('aria-disabled', 'true');
  await expect(newPane).toHaveAttribute('title', 'The current limit is 4 panes.');
  await newPane.dispatchEvent('click');
  await expect(page.locator('[data-testid^="chart-pane-pane-"]')).toHaveCount(4);
});
