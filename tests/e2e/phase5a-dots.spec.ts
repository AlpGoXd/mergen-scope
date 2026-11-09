import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`sample dots are independent, undoable and survive save and reload (${theme})`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html');
    await page.getByTestId('empty-chart-file-input').setInputFiles({name:'voltage.csv', mimeType:'text/csv', buffer:Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n')});
    await page.keyboard.press('2');
    const row = page.locator('[data-testid^="trace-row-"]').first();
    await row.getByTitle('Show in panes').click();
    await row.getByRole('checkbox', {name:'Pane 2'}).check();
    await row.getByTitle('Show in panes').click();
    const pane1 = page.getByTestId('chart-pane-pane-1');
    const pane2 = page.getByTestId('chart-pane-pane-2');
    const dots1 = pane1.locator('.recharts-line-dot');
    const dots2 = pane2.locator('.recharts-line-dot');
    await expect(dots1).toHaveCount(0);
    await expect(dots2).toHaveCount(0);
    await pane1.getByTitle('Pane settings').click();
    await expect(page.getByText('Minor grid')).toHaveCount(0);
    await page.getByRole('checkbox', {name:'Sample dots'}).check();
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
    await expect(page.getByRole('checkbox', {name:'Sample dots'})).toBeChecked();
    await page.screenshot({path:`docs/redesign/phase5a-dots-evidence/${theme}.png`, scale:'device', animations:'disabled'});
  });
}
