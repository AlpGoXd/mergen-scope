import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ORIGIN = 'http://127.0.0.1:4173';
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

function watchOrigins(page: Page) {
  const external: string[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.protocol.startsWith('http') && url.origin !== ORIGIN) external.push(request.url()); });
  return external;
}

test('at 1440 wide the landing frames the live demo, with no request to another origin', async ({ page }) => {
  const external = watchOrigins(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const frame = page.locator('[data-live-frame] iframe');
  await expect(frame).toHaveAttribute('title', 'Mergen Scope demo');
  await expect(frame).toHaveAttribute('src', 'app.html?demo=1&embed=1');
  await expect(page.locator('[data-live-frame]')).toHaveClass(/is-loaded/);
  const app = page.frameLocator('[data-live-frame] iframe');
  await expect(app.getByTestId('chart-pane-pane-3').locator('.recharts-line').first()).toBeVisible();
  await expect(app.locator('aside')).toHaveCount(0);
  const tikz = page.locator('.tex');
  await expect(tikz).toContainText('\\begin{tikzpicture}');
  await expect(tikz).toContainText('\\addplot');
  await expect(tikz).toContainText('\\end{tikzpicture}');
  await expect(page.locator('[data-version]')).toHaveText([`v${version}`, `v${version}`]);
  const svg = page.locator('#export .paper img');
  await svg.scrollIntoViewIfNeeded();
  await svg.evaluate(async (img: HTMLImageElement) => img.decode());
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  expect(external).toEqual([]);
});

test('at 390 wide the landing shows only the poster, without horizontal scroll', async ({ page }) => {
  const external = watchOrigins(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.poster:visible')).toHaveCount(1);
  await expect(page.getByText('Open it on a laptop or desktop to try it')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(external).toEqual([]);
});

test('the theme switch reloads the frame in the new theme', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('[data-live-frame]')).toHaveClass(/is-loaded/);
  await page.locator('[data-theme-switch]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('mergen-theme-preference'))).toBe('dark');
  await expect(page.locator('[data-live-frame]')).toHaveClass(/is-loaded/);
  await expect(page.frameLocator('[data-live-frame] iframe').getByTestId('app-root')).toHaveClass(/theme-dark/);
});

test('the landing uses content-versioned URLs for its cacheable assets', async ({ page }) => {
  await page.goto('/');
  const assets = await page.locator(
    'link[href^="landing-assets/landing.css"], script[src^="landing-assets/landing.js"], img[src^="landing-assets/img/"], [data-tex]',
  ).evaluateAll(nodes => nodes.map(node => node.getAttribute('src') ?? node.getAttribute('href') ?? node.getAttribute('data-tex')!));
  expect(assets).toHaveLength(6);
  for (const asset of assets) {
    const url = new URL(asset, ORIGIN);
    const contents = readFileSync(new URL(`../../dist${url.pathname}`, import.meta.url));
    const revision = createHash('sha256').update(contents).digest('hex').slice(0, 12);
    expect(url.searchParams.get('v'), url.pathname).toBe(revision);
  }
});
