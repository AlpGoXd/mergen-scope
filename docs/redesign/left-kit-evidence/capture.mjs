import { chromium } from 'playwright';
import { resolve } from 'node:path';
const browser = await chromium.launch({headless: true});
for (const theme of ['light', 'dark']) {
 const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await page.addInitScript(t => localStorage.setItem('mergen-theme-preference', t), theme);
 await page.goto('http://127.0.0.1:5194/app.html');
 await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
 await page.getByTestId('touchstone-cell-S11').waitFor();
 await page.screenshot({path:`docs/redesign/left-kit-evidence/${theme}.png`});
 await page.close();
}
await browser.close();
