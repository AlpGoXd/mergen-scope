import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'path';

const fixture = resolve(process.cwd(), 'test files/cascade_ip3_-12dBm.DAT');
const frequencyCsv = 'Frequency (Hz),Magnitude (dBm)\n100,1\n200,2\n300,3\n';
const timeCsv = 'Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n';
const pane = (page: Page, id: number) => page.getByTestId(`chart-pane-pane-${id}`);
const header = (page: Page, id: number) => page.getByTestId(`chart-pane-header-pane-${id}`);

async function threePanes(page: Page) {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(fixture);
  await expect(page.getByTestId('chart-plot-pane-1')).toBeVisible();
  await page.keyboard.press('3');
  await expect(pane(page, 3)).toBeVisible();
  await expect(pane(page, 2)).toBeVisible();
}

async function dropCsv(page: Page, id: number, name: string, text: string) {
  await pane(page, id).evaluate((target, file) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([file.text], file.name, { type: 'text/csv' }));
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { name, text });
}

test('pane swap follows position, is one undo step, and self drops and cancellation do nothing', async ({ page }) => {
  await threePanes(page);
  const trace = page.locator('[data-testid^="trace-row-"]').first();
  await expect(trace).toContainText('P1');
  const firstBox = await pane(page, 1).boundingBox();
  const thirdBox = await pane(page, 3).boundingBox();
  if (!firstBox || !thirdBox) throw new Error('Panes are not visible');
  expect(thirdBox.y).toBeGreaterThan(firstBox.y);
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await header(page, 1).dispatchEvent('dragstart', { dataTransfer: transfer });
  await expect(header(page, 1)).toHaveClass(/pane-header-dragging/);
  await pane(page, 3).dispatchEvent('dragover', { dataTransfer: transfer });
  await expect(pane(page, 3).locator('.pane-drag-overlay--swap')).toHaveText('⇄ Swap with Pane 3');
  await pane(page, 3).dispatchEvent('drop', { dataTransfer: transfer });
  await header(page, 1).dispatchEvent('dragend', { dataTransfer: transfer });
  await expect(header(page, 1).locator('.ph-title')).toHaveText('Pane 3');
  await expect(header(page, 3).locator('.ph-title')).toHaveText('Pane 1');
  await expect(trace).toContainText('P3');
  await expect.poll(async () => (await pane(page, 1).boundingBox())?.y ?? -1).toBeGreaterThan(firstBox.y + 10);
  await expect.poll(async () => (await pane(page, 3).boundingBox())?.y ?? Infinity).toBeLessThan(thirdBox.y - 10);
  await page.keyboard.press('Control+z');
  await expect(header(page, 1).locator('.ph-title')).toHaveText('Pane 1');
  await expect(header(page, 3).locator('.ph-title')).toHaveText('Pane 3');
  await expect(trace).toContainText('P1');
  await expect.poll(async () => Math.abs(((await pane(page, 1).boundingBox())?.y ?? -1000) - firstBox.y)).toBeLessThan(3);

  const self = await page.evaluateHandle(() => new DataTransfer());
  await header(page, 1).dispatchEvent('dragstart', { dataTransfer: self });
  await pane(page, 1).dispatchEvent('dragover', { dataTransfer: self });
  await expect(pane(page, 1).locator('.pane-drag-overlay')).toHaveCount(0);
  await pane(page, 1).dispatchEvent('drop', { dataTransfer: self });
  await header(page, 1).dispatchEvent('dragend', { dataTransfer: self });
  await expect(trace).toContainText('P1');
  await expect(header(page, 1).locator('.ph-title')).toHaveText('Pane 1');

  const cancelled = await page.evaluateHandle(() => new DataTransfer());
  await header(page, 1).dispatchEvent('dragstart', { dataTransfer: cancelled });
  await pane(page, 3).dispatchEvent('dragover', { dataTransfer: cancelled });
  await expect(pane(page, 3).locator('.pane-drag-overlay--swap')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pane(page, 3).locator('.pane-drag-overlay')).toHaveCount(0);
  await header(page, 1).dispatchEvent('dragend', { dataTransfer: cancelled });
  await expect(header(page, 1)).not.toHaveClass(/pane-header-dragging/);
  await expect(trace).toContainText('P1');
  const ended = await page.evaluateHandle(() => new DataTransfer());
  await header(page, 1).dispatchEvent('dragstart', { dataTransfer: ended });
  await pane(page, 3).dispatchEvent('dragover', { dataTransfer: ended });
  await expect(pane(page, 3).locator('.pane-drag-overlay--swap')).toBeVisible();
  await header(page, 1).dispatchEvent('dragend', { dataTransfer: ended });
  await expect(pane(page, 3).locator('.pane-drag-overlay')).toHaveCount(0);
});

test('trace and file drags describe each destination and refuse incompatible drops', async ({ page }) => {
  await threePanes(page);
  await dropCsv(page, 2, 'frequency.csv', frequencyCsv);
  await expect(page.getByTestId('chart-plot-pane-2')).toBeVisible();
  await dropCsv(page, 3, 'time.csv', timeCsv);
  const time = page.locator('[data-testid^="trace-row-"]').filter({ hasText: 'time.csv' }).first();
  await expect(time).toContainText('P3');
  const frequency = page.locator('[data-testid^="trace-row-"]').first();
  await expect(frequency).toContainText('P1');
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await frequency.dispatchEvent('dragstart', { dataTransfer: transfer });
  await pane(page, 1).dispatchEvent('dragover', { dataTransfer: transfer });
  await expect(pane(page, 1).locator('.pane-drag-overlay--already')).toHaveText('Already in Pane 1');
  await pane(page, 1).dispatchEvent('dragleave', { dataTransfer: transfer });
  await expect(pane(page, 1).locator('.pane-drag-overlay')).toHaveCount(0);
  await pane(page, 2).dispatchEvent('dragover', { dataTransfer: transfer });
  await expect(pane(page, 2).locator('.pane-drag-overlay--move')).toHaveText('Move to Pane 2');
  await frequency.dispatchEvent('dragend', { dataTransfer: transfer });
  await expect(pane(page, 2).locator('.pane-drag-overlay')).toHaveCount(0);

  const timeTransfer = await page.evaluateHandle(() => new DataTransfer());
  await time.dispatchEvent('dragstart', { dataTransfer: timeTransfer });
  await pane(page, 2).dispatchEvent('dragover', { dataTransfer: timeTransfer });
  await expect(pane(page, 2).locator('.pane-drag-overlay--refused')).toHaveText("It's a time capture and Pane 2 shows frequency. Drop it on a time pane, an empty pane or + New pane.");
  await expect(page.getByRole('alert')).toHaveCount(0);
  await pane(page, 2).dispatchEvent('drop', { dataTransfer: timeTransfer });
  await time.dispatchEvent('dragend', { dataTransfer: timeTransfer });
  await expect(pane(page, 2).getByRole('status')).toContainText('Pane 2 shows frequency');
  await expect(time).toContainText('P3');
  await expect(page.getByRole('alert')).toHaveCount(0);

  const fileTransfer = await page.evaluateHandle(() => { const transfer = new DataTransfer(); transfer.items.add(new File(['data'], 'drag.csv', { type: 'text/csv' })); return transfer; });
  await pane(page, 1).dispatchEvent('dragover', { dataTransfer: fileTransfer });
  await expect(pane(page, 1).locator('.pane-drag-overlay--open')).toHaveText('Open in Pane 1');
  await pane(page, 1).dispatchEvent('dragleave', { dataTransfer: fileTransfer });
  await expect(pane(page, 1).locator('.pane-drag-overlay')).toHaveCount(0);
});
