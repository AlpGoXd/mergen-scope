import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({headless:true});
console.log('browser version:', browser.version());
for (const mode of ['demo','empty']) for (const theme of ['light','dark']) for (const [width,height] of (mode === 'demo' ? [[1440,900],[1024,640]] : [[1440,900]])) {
 const context = await browser.newContext({viewport:{width,height}, colorScheme:theme});
 const page = await context.newPage();
 await page.goto('http://127.0.0.1:5193/app.html', {waitUntil:'networkidle'});
 if (mode === 'demo') {
  await page.getByTestId('empty-chart-file-input').setInputFiles('demo-assets/demo_cascade_ip3_-12dBm.DAT');
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await expect(page.getByTestId('empty-chart-dropzone')).toHaveCount(0);
 } else {
  await expect(page.getByTestId('empty-chart-dropzone')).toBeVisible();
  await expect(page.locator('[data-testid^="trace-row-"]')).toHaveCount(0);
 }
 await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${theme}`));
 await page.waitForTimeout(1000);
 console.log(mode,theme,width,height,'html class:',await page.locator('html').getAttribute('class'),'trace rows:',await page.locator('[data-testid^="trace-row-"]').count());
 await page.screenshot({path:`docs/redesign/baseline-artifacts/${mode}-${theme}-${width}x${height}.png`});
 await context.close();
}
await browser.close();
