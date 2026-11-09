import { chromium } from 'playwright';
import { resolve } from 'node:path';
const browser = await chromium.launch({headless:true});
for (const theme of ['light','dark']) {
 const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await page.addInitScript(t => localStorage.setItem('mergen-theme-preference', t),theme);
 await page.goto('http://127.0.0.1:5194/app.html');
 await page.getByTestId('empty-chart-file-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
 await page.getByRole('button',{name:'+ Pane',exact:true}).click();
 const row=page.locator('[data-testid^="trace-row-"]').first(); await row.getByTitle('Show in panes').click(); await row.getByRole('checkbox',{name:'Pane 2'}).check(); await page.keyboard.press('Escape');
 const plot=page.getByTestId('chart-plot-pane-1');
 await page.getByRole('button',{name:'New Marker',exact:true}).click(); await plot.click({position:{x:150,y:150}});
 await page.getByLabel('Choose a delta marker reference').click(); await page.getByRole('button',{name:/from M1/}).click(); await plot.click({position:{x:250,y:150}});
 await page.getByRole('button',{name:'V-Line'}).click(); await plot.click({position:{x:350,y:150}});
 await page.getByRole('button',{name:'H-Line'}).click(); await plot.click({position:{x:450,y:150}});
 await page.getByTestId('ref-line-row-V1').getByRole('button',{name:/Link to the other panes/}).click();
 await page.screenshot({path:`docs/redesign/left-kit-evidence/${theme}-populated.png`});
 await page.close();
}
await browser.close();
