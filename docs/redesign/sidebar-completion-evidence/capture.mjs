import { chromium } from 'playwright';
import { resolve } from 'node:path';
const browser = await chromium.launch({headless: true});
for (const theme of ['light', 'dark']) {
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(t => localStorage.setItem('mergen-theme-preference', t), theme);
 await page.goto('http://127.0.0.1:5184/app.html');
 await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
 await page.getByTestId('touchstone-cell-S11').waitFor();
 await page.screenshot({path:`docs/redesign/sidebar-completion-evidence/${theme}.png`});
 const boxes = await Promise.all(['dB','Mag','Phase','Re','Im'].map(n => page.getByRole('button',{name:n,exact:true}).boundingBox()));
 boxes.push(await page.getByLabel('More network views').boundingBox());
 console.log(theme, boxes.map(b=>b && [Math.round(b.x), Math.round(b.y),Math.round(b.width)]));
 await page.close();
}
await browser.close();
