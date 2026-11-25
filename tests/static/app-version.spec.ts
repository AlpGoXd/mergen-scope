import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

test('the built app shows its version in the footer, without the dev-server suffix', async ({ page }) => {
  await page.goto('/app.html');
  await expect(page.getByTestId('footer-version')).toHaveText(`v${version}`);
});
