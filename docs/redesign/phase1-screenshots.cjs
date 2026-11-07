const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({headless:true});
 for (const [width,height] of [[1440,900],[1024,640]]) for (const scheme of ['light','dark']) {
  const context = await browser.newContext({viewport:{width,height}, colorScheme:scheme});
  const page = await context.newPage();
  await page.goto('http://localhost:5191/app.html');
  await page.getByTestId('empty-chart-file-input').setInputFiles('demo-assets/demo_cascade_ip3_-12dBm.DAT');
  await page.getByText('demo_cascade_ip3_-12dBm.DAT').waitFor();
  await page.locator('[data-testid^="chart-pane-header-"]').first().waitFor();
  await page.locator('.recharts-line').first().waitFor();
  await page.evaluate(async () => { await Promise.all([document.fonts.load('400 12px "IBM Plex Sans"'), document.fonts.load('600 12px "IBM Plex Sans"'), document.fonts.load('700 12px "IBM Plex Sans"'), document.fonts.load('400 11px "JetBrains Mono"')]); await document.fonts.ready; });
  const details = await page.evaluate(() => ({theme:document.documentElement.className, fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})), traces:document.querySelectorAll('.recharts-line').length}));
  if (!details.theme.includes('theme-'+scheme) || details.traces < 1) throw Error(JSON.stringify(details));
  await page.screenshot({path:`docs/redesign/phase1-${scheme}-${width}x${height}.png`});
  console.log(scheme, JSON.stringify(details));
  await context.close();
 }
 await browser.close();
})();
