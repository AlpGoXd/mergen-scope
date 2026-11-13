import { test, expect } from '@playwright/test';

import { acceptImport } from './import-helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`sample dots are independent, undoable and survive save and reload (${theme})`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html');
    await page.getByTestId('app-open-input').setInputFiles({name:'voltage.csv', mimeType:'text/csv', buffer:Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n')});
    await acceptImport(page);
    for (let i = 1; i < 2; i += 1) { await page.locator('[data-testid^="chart-pane-header-"] .ph-title').last().click(); await page.getByRole('button', { name: '+ Pane', exact: true }).click(); } // 2 panes, appended (the 1–4 keys were retired)
    const row = page.locator('[data-testid^="trace-row-"]').first();
    await row.getByTitle('Show in panes').click();
    await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: 'Pane 2' }).click();
    await page.keyboard.press('Escape');
    const pane1 = page.getByTestId('chart-pane-pane-1');
    const pane2 = page.getByTestId('chart-pane-pane-2');
    const dots1 = pane1.locator('.recharts-line-dot');
    const dots2 = pane2.locator('.recharts-line-dot');
    await expect(dots1).toHaveCount(0);
    await expect(dots2).toHaveCount(0);
    await pane1.getByTitle('Pane settings').click();
    await expect(page.getByText('Minor grid')).toHaveCount(0);
    await page.getByTestId('sample-dots-toggle').click();
    await expect(dots1).toHaveCount(3);
    await expect(dots2).toHaveCount(0);
    await pane1.getByTitle('Pane settings').click();
    await page.keyboard.press('Control+z');
    await expect(dots1).toHaveCount(0);
    await page.keyboard.press('Control+Shift+z');
    await expect(dots1).toHaveCount(3);
    const download = page.waitForEvent('download');
    await page.getByTitle('Save Workspace JSON').click();
    const path = await (await download).path();
    expect(path).toBeTruthy();
    await page.getByRole('button', {name:'Clear All'}).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByTestId('topbar-workspace-input').setInputFiles(path!);
    await expect(dots1).toHaveCount(3);
    await expect(dots2).toHaveCount(0);
    await pane1.getByTitle('Pane settings').click();
    await expect(page.getByTestId('sample-dots-toggle')).toHaveAttribute('aria-pressed', 'true');
  });
}
