// Captures the landing page images from the real app, so they cannot go stale:
//   landing-assets/img/app-embed-light.webp, app-embed-dark.webp  (app.html?demo=1&embed=1, 1440×900 @2x)
//   landing-assets/img/export-pane1.svg                            (Export dialog › This pane › SVG › Save SVG, pane 1)
//   landing-assets/img/export-pane1.tex                            (Export dialog › This pane › TikZ › Save .tex, pane 1)
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

/** The Export dialog for pane 1 alone, set to `format` (its button label: 'SVG', 'TikZ'), with the app's default options. */
async function openExportDialog(page, format) {
  // Pane 1 becomes the target pane by a click on its header; Export… then opens the dialog.
  await page.getByTestId('chart-pane-header-pane-1').click({ position: { x: 8, y: 8 } });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^Export/ });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'This pane', exact: true }).click();
  await dialog.getByRole('button', { name: format, exact: true }).click();
  const heading = await dialog.getByRole('heading').first().innerText();
  if (!heading.includes('S21 Gain')) throw new Error(`Export dialog is for "${heading}", not pane 1`);
  return dialog;
}

async function saveFrom(page, dialog, button) {
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: button, exact: true }).click();
  const text = await readFile(await (await download).path(), 'utf8');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  return text;
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

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.addInitScript(() => { try { localStorage.setItem('mergen-theme-preference', 'light'); } catch { /* ignore */ } });
  const page = await context.newPage();
  await openDemo(page, 'demo=1');

  const svg = await saveFrom(page, await openExportDialog(page, 'SVG'), 'Save SVG');
  if (!svg.includes('<svg')) throw new Error('Save SVG did not produce an SVG file');
  writeFileSync(resolve(outDir, 'export-pane1.svg'), svg, 'utf8');
  console.log('wrote export-pane1.svg');

  const tex = await saveFrom(page, await openExportDialog(page, 'TikZ'), 'Save .tex');
  if (!tex.includes('\\begin{tikzpicture}')) throw new Error('Save .tex did not produce a TikZ figure');
  writeFileSync(resolve(outDir, 'export-pane1.tex'), tex.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote export-pane1.tex');

} finally {
  server?.kill();
  await browser?.close();
}
