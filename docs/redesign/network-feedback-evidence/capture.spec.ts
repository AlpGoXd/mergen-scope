import { test } from '@playwright/test';
import { resolve } from 'path';
for (const theme of ['light', 'dark']) {
  test(`capture ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.goto('/app.html');
    await page.getByTestId('empty-chart-file-input').setInputFiles(resolve(process.cwd(), 'test files/cascaded chain.s2p'));
    await page.getByRole('button', { name: 'ABCD', exact: true }).waitFor();
    await page.screenshot({ path: `docs/redesign/network-feedback-evidence/${theme}.png` });
  });
}
