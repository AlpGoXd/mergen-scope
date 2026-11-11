// Screenshots of the dev-only Smith demo. Run from the worktree root with the dev server up:
//   npx vite --port 5183 --strictPort
//   node docs/redesign/smith-evidence/capture.cjs [http://127.0.0.1:5183]
const path = require('path');
const { chromium } = require('@playwright/test');

const base = process.argv[2] || 'http://127.0.0.1:5183';
const out = __dirname;
const page_url = query => `${base}/src/components/smith/demo/index.html?bare=1&${query}`;

async function shot(browser, name, query, viewport, act) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(page_url(query));
  await page.waitForSelector('[data-testid="smith-trace-s11"] path');
  await page.evaluate(() => document.fonts.ready);
  if (act) await act(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  if (errors.length) throw new Error(`${name}: ${errors.join(' | ')}`);
  await page.close();
  console.log('wrote', name);
}

/** Screen position of a point on a trace, read from the hit-test the pane itself uses. */
async function hoverTrace(page, traceId, fraction) {
  const at = await page.evaluate(({ traceId, fraction }) => {
    const path = document.querySelector(`[data-testid="smith-trace-${traceId}"] path:not(.is-faint)`);
    const p = path.getPointAtLength(path.getTotalLength() * fraction);
    const m = path.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }, { traceId, fraction });
  await page.mouse.move(at.x + 3, at.y + 3);
  return at;
}

(async () => {
  const browser = await chromium.launch();
  const wide = { width: 1000, height: 700 };
  await shot(browser, 'smith-light', 'theme=light', wide);
  await shot(browser, 'smith-dark', 'theme=dark', wide);
  await shot(browser, 'smith-light-hover', 'theme=light', wide, page => hoverTrace(page, 's22', 0.35));
  await shot(browser, 'smith-dark-band-zy', 'theme=dark&band=1&grid=both', wide, page => hoverTrace(page, 's11', 0.5));
  await shot(browser, 'smith-light-zy', 'theme=light&grid=both', wide);
  await shot(browser, 'smith-light-band', 'theme=light&band=1', wide);
  await shot(browser, 'smith-light-ygrid-ms', 'theme=light&grid=y&labels=ohms&select=m2', wide);
  await shot(browser, 'smith-light-active', 'theme=light&active=1', wide);
  await shot(browser, 'smith-dark-active', 'theme=dark&active=1', wide);
  await shot(browser, 'smith-light-zoom-ohms', 'theme=light&labels=ohms', wide, async page => {
    const at = await hoverTrace(page, 's11', 0.5);
    for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(30); }
    await page.mouse.move(at.x + 40, at.y + 30);
    await page.mouse.move(at.x + 3, at.y + 3);
  });
  for (const size of ['compact', 'comfortable', 'large']) {
    await shot(browser, `smith-size-${size}`, `theme=light&size=${size}`, { width: 640, height: 460 });
  }
  await shot(browser, 'smith-narrow-dark', 'theme=dark&size=compact', { width: 340, height: 320 });
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
