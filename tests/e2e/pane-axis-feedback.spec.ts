import { test, expect } from '@playwright/test';

import { acceptImport } from './import-helpers';

const datasets = [
  { name: 'voltage.csv', csv: 'Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n' },
  { name: 'large.csv', csv: 'Time (s),CH1 (V)\n0,-1234567890123\n0.5,0\n1,9876543210123\n' },
  { name: 'small.csv', csv: 'Time (s),CH1 (V)\n0,-0.000000000123456\n0.5,0\n1,0.000000000987654\n' },
];

for (const dataset of datasets) {
  test(`four panes contain visible y-axis labels with ${dataset.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('/app.html');
    await page.getByTestId('app-open-input').setInputFiles({ name: dataset.name, mimeType: 'text/csv', buffer: Buffer.from(dataset.csv) });
    await acceptImport(page);
    for (let i = 1; i < 4; i += 1) { await page.locator('[data-testid^="chart-pane-header-"] .ph-title').last().click(); await page.getByRole('button', { name: '+ Pane', exact: true }).click(); } // 4 panes, appended (the 1–4 keys were retired)
    const row = page.locator('[data-testid^="trace-row-"]').first();
    await row.getByTitle('Show in panes').click();
    for (const n of [2, 3, 4]) await page.getByRole('menuitemcheckbox', { name: `Pane ${n}` }).click();
    await page.keyboard.press('Escape');
    const plots = page.locator('[data-testid^="chart-plot-"]');
    await expect(plots).toHaveCount(4);
    for (const size of [{ width: 1024, height: 640 }, { width: 1440, height: 900 }, { width: 1024, height: 720 }]) {
      await page.setViewportSize(size);
      for (const plot of await plots.all()) {
        const label = plot.locator('.recharts-yAxis .recharts-label');
        await expect(label).toBeVisible();
        await expect(label).not.toHaveText('');
        if (size.height === 900) await expect(label).toHaveText('Amplitude (V)');
        await expect.poll(() => plot.evaluate(element => {
          const pane = element.getBoundingClientRect();
          const labels = element.querySelectorAll('.recharts-yAxis .recharts-label, .recharts-yAxis .recharts-cartesian-axis-tick text');
          return [...labels].map(item => {
            const bounds = item.getBoundingClientRect();
            return { text: item.textContent, top: bounds.top - pane.top, bottom: bounds.bottom - pane.bottom, left: bounds.left - pane.left, right: bounds.right - pane.right };
          }).filter(item => item.top < 0 || item.bottom > 0 || item.left < 0 || item.right > 0);
        })).toEqual([]);
      }
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`target pane header respects ${theme} theme`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html');
    await expect(page.locator(`.theme-${theme}`).first()).toBeAttached();
    await page.getByTestId('app-open-input').setInputFiles({ name: datasets[0].name, mimeType: 'text/csv', buffer: Buffer.from(datasets[0].csv) });
    await acceptImport(page);
    for (let i = 1; i < 4; i += 1) { await page.locator('[data-testid^="chart-pane-header-"] .ph-title').last().click(); await page.getByRole('button', { name: '+ Pane', exact: true }).click(); } // 4 panes, appended (the 1–4 keys were retired)
    const row = page.locator('[data-testid^="trace-row-"]').first();
    await row.getByTitle('Show in panes').click();
    for (const n of [2, 3, 4]) await page.getByRole('menuitemcheckbox', { name: `Pane ${n}` }).click();
    await row.getByTitle('Show in panes').click();
    await expect(page.locator('[data-testid^="chart-plot-"]')).toHaveCount(4);
    await expect(page.getByText('Updated trace panes')).toHaveCount(0, { timeout: 10000 });
    const brightness = await page.getByTestId('chart-pane-header-pane-1').evaluate(element => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = getComputedStyle(element).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return (r + g + b) / 3;
    });
    if (theme === 'dark') expect(brightness).toBeLessThan(100);
    else expect(brightness).toBeGreaterThan(150);
    if (process.env.PANE_FEEDBACK_CAPTURE) await page.screenshot({ path: `docs/redesign/pane-feedback-evidence/four-pane-${theme}.png`, animations: 'disabled' });
  });
}








