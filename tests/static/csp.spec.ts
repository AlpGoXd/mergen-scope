import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const policy = readFileSync('dist/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)?.[1];

test('landing and demo run under the Pages CSP without external requests', async ({ page }) => {
  expect(policy).toBeTruthy();
  const external: string[] = [];
  const violations: string[] = [];
  page.on('request', request => { if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') external.push(request.url()); });
  page.on('console', message => { if (message.text().includes('Content Security Policy')) violations.push(message.text()); });
  await page.route('**/*', async route => {
    const response = await route.fetch();
    const headers = { ...response.headers(), 'content-security-policy': policy! };
    await route.fulfill({ response, headers });
  });
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await page.goto('/app.html?demo=1');
  await expect(page.getByTestId('chart-pane-pane-3')).toBeVisible();
  await expect(page.getByTestId('chart-pane-pane-2').getByTestId('smith-pane')).toBeVisible();
  expect(external).toEqual([]);
  expect(violations).toEqual([]);
});
