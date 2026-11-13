import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const policy = readFileSync('dist/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)?.[1];

test('Download image works in the built app under the Pages CSP', async ({ page }) => {
  expect(policy).toBeTruthy();
  const violations: string[] = [];
  page.on('console', message => { if (message.text().includes('Content Security Policy')) violations.push(message.text()); });
  await page.route('**/*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy ?? '' } });
  });
  await page.goto('/app.html?demo=1');
  const pane = page.getByTestId('chart-pane-pane-3');
  await expect(pane.locator('.recharts-line').first()).toBeVisible();
  await pane.getByTitle('Pane settings').click();
  const download = page.waitForEvent('download');
  await page.locator('.ui-popover').getByRole('button', { name: 'Download image' }).click();
  const file = await download;
  // Demo panes are named ("Scope | 1 kHz + 5 kHz"): characters not allowed in file names become "-".
  expect(file.suggestedFilename()).toMatch(/^[^|\s]+_[^|\s]+_\d{4}-\d{2}-\d{2}\.png$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  const box = await pane.boundingBox();
  expect(Math.abs(bytes.readUInt32BE(16) - Math.round((box?.width ?? 0) * 2))).toBeLessThanOrEqual(2);
  expect(violations).toEqual([]);
});
