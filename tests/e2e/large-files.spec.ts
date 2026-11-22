import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { acceptImport } from './import-helpers';
import { answerAppDialog, appDialog } from './workspace-helpers';

const csv = 'Time (s),CH1 (V)\n0,1\n1,2\n';

test('a 51 MB CSV asks before reading and can be cancelled or opened', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('large.csv');
  // Playwright caps inline setInputFiles buffers at 50 MB. The padding is a blank CSV line.
  const buffer = Buffer.alloc(51 * 1024 * 1024, ' ');
  buffer.write(csv);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buffer);

  await page.goto('/app.html');
  await page.evaluate(() => {
    const readText = File.prototype.text;
    File.prototype.text = function (this: File) {
      if (this.name === 'large.csv') document.documentElement.dataset['largeFileRead'] = 'true';
      return readText.call(this);
    };
  });
  const input = page.getByTestId('app-open-input');
  const root = page.locator('html');
  await input.setInputFiles(file);
  await expect(appDialog(page)).toContainText('large.csv is 51 MB. Large files can make the app slow. Open it anyway?');
  expect(await root.getAttribute('data-large-file-read')).toBeNull();
  await answerAppDialog(page, 'Cancel');
  expect(await root.getAttribute('data-large-file-read')).toBeNull();
  await expect(page.getByTestId('import-wizard')).toHaveCount(0);
  await expect(page.locator('.lp-file')).toHaveCount(0);

  await input.setInputFiles(file);
  await answerAppDialog(page, 'Open anyway');
  await expect(page.getByTestId('import-wizard')).toContainText('large.csv');
  await expect(root).toHaveAttribute('data-large-file-read', 'true');
});

test('a refused file is never read and another file in the same pane drop opens', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('chart-pane-pane-1').evaluate((target, text) => {
    const readText = File.prototype.text;
    const size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size');
    if (!size?.get) throw new Error('Blob size getter unavailable');
    const readSize = size.get;
    // Simulate the size reported by the browser without allocating an oversized file.
    Object.defineProperty(File.prototype, 'size', {
      configurable: true,
      get(this: File): number {
        return this.name === 'too-large.csv' ? 612 * 1024 * 1024 : Number(readSize.call(this));
      },
    });
    File.prototype.text = function (this: File) {
      if (this.name === 'too-large.csv') document.documentElement.dataset['refusedFileRead'] = 'true';
      return readText.call(this);
    };
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'too-large.csv', { type: 'text/csv' }));
    transfer.items.add(new File([text], 'small.csv', { type: 'text/csv' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, csv);
  await acceptImport(page);
  await expect(appDialog(page)).toHaveCount(0);
  await expect(page.locator('.lp-file')).toHaveText(/small\.csv/);
  await expect(page.getByTestId('import-error')).toContainText("Could not import too-large.csv: File size is 612 MB. Files over 500 MB can't be opened in the browser.");
  expect(await page.locator('html').getAttribute('data-refused-file-read')).toBeNull();
});
