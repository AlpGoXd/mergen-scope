// Evidence screenshots for the pane chrome redesign. Run from the repo root with the dev server up:
//   npx vite --port 5184 --strictPort
//   node docs/redesign/pane-chrome-evidence/capture.cjs [http://127.0.0.1:5184]
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const base = process.argv[2] || 'http://127.0.0.1:5184';
const out = __dirname;
const file = path.resolve('test files/cascaded chain.s2p');

async function save(target, name) {
  const png = await target.screenshot();
  for (let attempt = 0; ; attempt++) {
    try { fs.writeFileSync(path.join(out, `${name}.png`), png); break; }
    catch (error) { if (attempt >= 20) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  console.log('wrote', name);
}

async function selectLayout(page, name) {
  await page.getByRole('button', { name: /^Layout:/ }).click();
  await page.locator('.ui-popover[aria-label="Layout"] [data-layout-tile]').filter({ has: page.getByText(name, { exact: true }) }).click();
}

async function run(browser, theme) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
  await page.goto(`${base}/app.html`);
  await page.getByTestId('app-open-input').setInputFiles(file);
  await page.getByTestId('touchstone-cell-S11').waitFor();
  const pane = n => page.getByTestId(`chart-pane-pane-${n}`);

  // Pane 1: Chart with S21. Pane 2: Smith with S11. Pane 3: Chart with S11.
  await page.getByTestId('touchstone-cell-S21').click();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(2).locator('.ptp-tile').filter({ hasText: 'Smith' }).click();
  await page.getByTestId('touchstone-cell-S11').click();
  await pane(2).locator('[data-testid^="smith-trace-"]').first().waitFor();
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await pane(3).locator('.ptp-tile').filter({ hasText: 'Chart' }).click();
  await page.getByTestId('touchstone-cell-S22').click();
  await selectLayout(page, '1 + side');
  await page.getByTestId('chart-pane-header-pane-1').click({ position: { x: 30, y: 10 } });
  await page.mouse.move(700, 880);
  await page.waitForTimeout(300);
  await save(page, `${theme}-layout-1-plus-side`);

  // Pane settings (the merged popover), on the chart and on the Smith pane.
  await page.getByTestId('chart-pane-header-pane-1').getByTitle('Pane settings').click();
  await page.waitForTimeout(150);
  await save(page, `${theme}-pane-settings-chart`);
  await page.keyboard.press('Escape');
  await page.getByTestId('chart-pane-header-pane-2').getByTitle('Pane settings').click();
  await page.waitForTimeout(150);
  await save(page, `${theme}-pane-settings-smith`);
  await page.keyboard.press('Escape');

  // Smith: Samples on, then the range line, with a value being edited.
  await page.getByTestId('chart-pane-header-pane-2').getByTestId('samples-toggle').click();
  const start = pane(2).getByTestId('smith-range-start');
  await start.click(); await start.fill('2.4 GHz'); await start.press('Enter');
  const stop = pane(2).getByTestId('smith-range-stop');
  await stop.click(); await stop.fill('5 GHz'); await stop.press('Enter');
  await page.mouse.move(700, 880);
  await page.waitForTimeout(200);
  await save(pane(2), `${theme}-smith-range-line`);
  await pane(2).getByTestId('smith-range-stop').click();
  await pane(2).getByTestId('smith-range-stop').fill('1 GHz');
  await pane(2).getByTestId('smith-range-stop').press('Enter');
  await page.waitForTimeout(150);
  await save(pane(2), `${theme}-smith-range-invalid`);
  await page.keyboard.press('Escape');

  // A divider being dragged: the split tag, live resize, the pane that is not involved dimmed.
  const divider = page.getByRole('separator', { name: 'Resize panes' }).and(page.locator('[aria-orientation="horizontal"]')).first();
  const box = await divider.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(100);
  await save(page, `${theme}-divider-hover`);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 90, { steps: 6 });
  await page.waitForTimeout(100);
  await save(page, `${theme}-divider-drag`);
  await page.mouse.up();

  // A marker value being edited in the left panel (rest, hover, editing, invalid).
  await page.getByTestId('chart-pane-header-pane-1').click({ position: { x: 30, y: 10 } });
  await page.keyboard.press('n');
  const plot = await page.getByTestId('chart-plot-pane-1').boundingBox();
  await page.mouse.click(plot.x + plot.width * 0.45, plot.y + plot.height * 0.45);
  const row = page.getByTestId('marker-row-1');
  await row.waitFor();
  const panel = row.locator('xpath=ancestor::*[contains(@class,"lp-")][last()]');
  await page.mouse.move(700, 880);
  await save(row, `${theme}-marker-value-rest`);
  await row.getByLabel('M1 position').hover();
  await save(row, `${theme}-marker-value-hover`);
  await row.getByLabel('M1 position').click();
  await page.waitForTimeout(100);
  await save(row, `${theme}-marker-value-editing`);
  await row.getByLabel('M1 position').fill('not a number');
  await row.getByLabel('M1 position').press('Enter');
  await page.waitForTimeout(100);
  const rb = await row.boundingBox();
  const invalid = await page.screenshot({ clip: { x: rb.x - 4, y: rb.y - 4, width: rb.width + 8, height: rb.height + 34 } });
  fs.writeFileSync(path.join(out, `${theme}-marker-value-invalid.png`), invalid);
  console.log('wrote', `${theme}-marker-value-invalid`, await panel.count());
  await page.keyboard.press('Escape');
  await page.close();

  // Headers at five widths: one chart pane and one Smith pane forced to each width.
  const narrow = await browser.newPage({ viewport: { width: 1500, height: 700 }, deviceScaleFactor: 2 });
  narrow.on('pageerror', error => errors.push(String(error)));
  await narrow.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
  await narrow.goto(`${base}/app.html`);
  await narrow.getByTestId('app-open-input').setInputFiles(file);
  await narrow.getByTestId('touchstone-cell-S21').click();
  await narrow.getByTestId('chart-pane-header-pane-1').waitFor();
  for (const key of ['[', ']']) await narrow.keyboard.press(key); // close both side panels for room
  const strip = [];
  for (const width of [900, 600, 420, 320, 240]) {
    await narrow.getByTestId('chart-pane-pane-1').evaluate((element, w) => { element.style.flex = 'none'; element.style.width = `${w}px`; }, width);
    await narrow.waitForTimeout(150);
    const header = narrow.getByTestId('chart-pane-header-pane-1');
    const metrics = await header.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth, level: element.dataset.level, height: element.getBoundingClientRect().height }));
    if (metrics.scroll > metrics.client) throw new Error(`header overflows at ${width}: ${JSON.stringify(metrics)}`);
    console.log(theme, width, JSON.stringify(metrics));
    strip.push(await header.screenshot());
    fs.writeFileSync(path.join(out, `${theme}-header-${width}.png`), strip[strip.length - 1]);
  }
  await narrow.close();
  if (errors.length) throw new Error(errors.join(' | '));
}

(async () => {
  const browser = await chromium.launch();
  for (const theme of ['light', 'dark']) await run(browser, theme);
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
