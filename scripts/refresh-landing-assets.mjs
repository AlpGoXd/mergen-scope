// Captures the landing page images from the real app, so they cannot go stale:
//   landing-assets/img/app-embed-light.webp, app-embed-dark.webp  (app.html?demo=1&embed=1, 1440×900 @2x)
//   landing-assets/img/export-pane1.svg                            (Pane 1 settings › Download SVG)
//   landing-assets/img/export-pane1.tex                            (Pane 1 settings › Copy as LaTeX)
// Run with `npm run capture:landing`. It starts its own dev server unless CAPTURE_BASE points at one.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'landing-assets/img');
const port = Number(process.env.CAPTURE_PORT ?? 5199);
const base = process.env.CAPTURE_BASE ?? `http://127.0.0.1:${port}`;

async function waitFor(url, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise(done => setTimeout(done, 300));
  }
  throw new Error(`Dev server did not answer at ${url}`);
}

let server = null;
let browser = null;
if (!process.env.CAPTURE_BASE) {
  const vite = fileURLToPath(new URL('bin/vite.js', import.meta.resolve('vite/package.json')));
  server = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
}

/** Open the demo and wait until every pane has drawn and the fonts are in. */
async function openDemo(page, query) {
  await page.goto(`${base}/app.html?${query}`);
  for (const n of [1, 3, 4]) await page.getByTestId(`chart-pane-pane-${n}`).locator('.recharts-line').first().waitFor();
  await page.getByTestId('chart-pane-pane-2').getByTestId('smith-pane').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
}

/** Playwright writes PNG or JPEG only; Chromium's canvas encoder makes the WebP, so no image library is needed. */
async function toWebp(page, png, quality) {
  const dataUrl = await page.evaluate(async ({ src, q }) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', q);
  }, { src: `data:image/png;base64,${png.toString('base64')}`, q: quality });
  if (!dataUrl.startsWith('data:image/webp')) throw new Error('This browser did not encode WebP');
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

async function openPaneSettings(page) {
  await page.getByTestId('chart-pane-header-pane-1').getByTitle('Pane settings').click();
  return page.locator('.ui-popover').filter({ has: page.getByRole('button', { name: 'Download SVG', exact: true }) });
}

try {
  await waitFor(`${base}/app.html`, 60_000);
  mkdirSync(outDir, { recursive: true });
  browser = await chromium.launch();

  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
    await context.addInitScript(value => { try { localStorage.setItem('mergen-theme-preference', value); } catch { /* ignore */ } }, theme);
    const page = await context.newPage();
    await openDemo(page, 'demo=1&embed=1');
    // Embed mode hides toasts already; this makes sure none is caught mid-fade.
    await page.addStyleTag({ content: '.ui-toast-host { display: none !important; }' });
    const png = await page.screenshot({ type: 'png' });
    const file = resolve(outDir, `app-embed-${theme}.webp`);
    writeFileSync(file, await toWebp(page, png, 0.85));
    console.log(`wrote ${file}`);
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await context.addInitScript(() => {
    localStorage.setItem('mergen-theme-preference', 'light');
    localStorage.setItem('mergen-export-image-options', JSON.stringify({ size: 'ieee-1', dpi: 600, theme: 'print' }));
  });
  const page = await context.newPage();
  await openDemo(page, 'demo=1');

  const settings = await openPaneSettings(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    settings.getByRole('button', { name: 'Download SVG', exact: true }).click(),
  ]);
  const svg = await readFile(await download.path(), 'utf8');
  if (!svg.includes('<svg')) throw new Error('Download SVG did not produce an SVG file');
  writeFileSync(resolve(outDir, 'export-pane1.svg'), svg, 'utf8');
  console.log('wrote export-pane1.svg');

  if (!(await settings.isVisible())) await openPaneSettings(page);
  await settings.getByRole('button', { name: 'Copy as LaTeX', exact: true }).click();
  await page.locator('.ui-toast').filter({ hasText: 'copied as LaTeX' }).waitFor();
  const tex = await page.evaluate(() => navigator.clipboard.readText());
  if (!tex.includes('\\begin{tikzpicture}')) throw new Error('Copy as LaTeX did not produce a TikZ figure');
  writeFileSync(resolve(outDir, 'export-pane1.tex'), tex.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote export-pane1.tex');

} finally {
  server?.kill();
  await browser?.close();
}
