import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { addAnalysis } from './analysis-helpers';

test('a parent and its child reorder as one block and cannot be split', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  const rows = page.locator('[data-testid^="trace-row-"]');
  const parentId = await rows.first().getAttribute('data-testid');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(rows.filter({ hasText: 'S21' }).first()).toBeVisible();
  const count = await rows.count();
  const card = await addAnalysis(page, 'Smooth');
  await card.locator('.an-select').first().click();
  await page.getByRole('menu', { name: 'Trace', exact: true }).getByRole('menuitemcheckbox').first().click();
  await card.getByRole('button', { name: 'Create trace' }).click();
  await expect(rows).toHaveCount(count + 1);
  await expect(rows.first()).toHaveAttribute('data-testid', parentId ?? '');
  await expect(rows.nth(1).locator('.lp-trace__child')).toBeVisible();
  await expect(rows.nth(1).locator('.lp-trace__fx')).toHaveText('ƒ');

  const childId = await rows.nth(1).getAttribute('data-testid');
  const otherId = await rows.nth(2).getAttribute('data-testid');
  if (!parentId || !childId || !otherId) throw new Error('missing trace');
  const parent = page.getByTestId(parentId);
  const child = page.getByTestId(childId);
  const other = page.getByTestId(otherId);
  const otherRow = await other.boundingBox();
  if (!otherRow) throw new Error('missing other row');
  const afterOther = { targetPosition: { x: 10, y: otherRow.height - 2 } };

  const traceOrder = () => rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')));
  const originalOrder = await traceOrder();
  await child.locator('.lp-trace__handle').dragTo(other, afterOther);
  expect(await traceOrder()).toEqual(originalOrder);

  await parent.locator('.lp-trace__handle').dragTo(other, afterOther);
  await expect(rows.first()).toHaveAttribute('data-testid', otherId);
  await expect(rows.nth(1)).toHaveAttribute('data-testid', parentId);
  await expect(rows.nth(2)).toHaveAttribute('data-testid', childId);
  await page.keyboard.press('Control+z');
  await expect(rows.first()).toHaveAttribute('data-testid', parentId);
  await expect(rows.nth(1)).toHaveAttribute('data-testid', childId);

  const parentRow = await parent.locator('.lp-trace').boundingBox();
  if (!parentRow) throw new Error('missing parent row');
  await other.locator('.lp-trace__handle').dragTo(parent, {
    targetPosition: { x: 10, y: parentRow.height + 1 },
  });
  const order = await traceOrder();
  expect(order[order.indexOf(parentId) + 1]).toBe(childId);
});

test('sibling traces can swap under their parent but cannot leave the group', async ({ page }) => {
  await page.goto('/app.html');
  const input = page.getByTestId('app-open-input');
  await input.setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  const rows = page.locator('[data-testid^="trace-row-"]');
  await expect(rows.first()).toBeVisible();
  const parentId = await rows.first().getAttribute('data-testid');
  await input.setInputFiles(resolve('test files/cascaded chain.s2p'));
  await expect(rows.filter({ hasText: 'S21' }).first()).toBeVisible();
  for (const title of ['Smooth', 'Offset / Scale']) {
    const card = await addAnalysis(page, title);
    await card.locator('.an-select').first().click();
    await page.getByRole('menu', { name: 'Trace', exact: true }).getByRole('menuitemcheckbox').first().click();
    await card.getByRole('button', { name: 'Create trace' }).click();
  }
  const parent = rows.first();
  const child = rows.nth(1);
  const sibling = rows.nth(2);
  await expect(child.locator('.lp-trace__fx')).toBeVisible();
  await expect(sibling.locator('.lp-trace__fx')).toBeVisible();
  const childId = await child.getAttribute('data-testid');
  const siblingId = await sibling.getAttribute('data-testid');
  if (!parentId || !childId || !siblingId) throw new Error('missing trace');
  await page.getByTestId(siblingId).locator('.lp-trace__handle').dragTo(page.getByTestId(childId), { targetPosition: { x: 12, y: 3 } });
  await expect(parent).toHaveAttribute('data-testid', parentId);
  await expect(child).toHaveAttribute('data-testid', siblingId);
  await expect(sibling).toHaveAttribute('data-testid', childId);
  await page.getByTestId(childId).locator('.lp-trace__handle').dragTo(rows.nth(3));
  await expect(sibling).toHaveAttribute('data-testid', childId);
  await page.keyboard.press('Control+z');
  await expect(child).toHaveAttribute('data-testid', childId);
  await expect(sibling).toHaveAttribute('data-testid', siblingId);
});

test('trace rows and analysis cards can be reordered independently and undone', async ({ page }) => {
  await page.goto('/app.html');
  const input = page.getByTestId('app-open-input');
  await input.setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  const rows = page.locator('[data-testid^="trace-row-"]');
  await expect(rows.first()).toBeVisible();
  const firstId = await rows.first().getAttribute('data-testid');
  if (!firstId) throw new Error('missing first trace');
  await input.setInputFiles(resolve('test files/cascaded chain.s2p'));
  const second = rows.filter({ hasText: 'S21' }).first();
  await expect(second).toBeVisible();
  const secondId = await second.getAttribute('data-testid');
  if (!secondId) throw new Error('missing second trace');
  const first = page.getByTestId(firstId);
  const firstBadge = await first.locator('.lp-pane-trigger__face').innerText();
  await page.getByTestId(secondId).locator('.lp-trace__handle').dragTo(first, { targetPosition: { x: 10, y: 2 } });
  await expect(rows.first()).toHaveAttribute('data-testid', secondId);
  await expect(first.locator('.lp-pane-trigger__face')).toHaveText(firstBadge);
  await page.keyboard.press('Control+z');
  await expect(rows.first()).toHaveAttribute('data-testid', firstId);
  await page.getByTestId(secondId).locator('.lp-trace__handle').dragTo(first, { targetPosition: { x: 10, y: 2 } });
  await expect(rows.first()).toHaveAttribute('data-testid', secondId);

  const smooth = await addAnalysis(page, 'Smooth');
  const scale = await addAnalysis(page, 'Offset / Scale');
  const cards = page.locator('[data-testid^="analysis-card-"]');
  await expect(cards.first()).toHaveAttribute('aria-label', 'Smooth');
  await scale.locator('.an-card__drag-handle').dragTo(smooth, { targetPosition: { x: 10, y: 2 } });
  await expect(cards.first()).toHaveAttribute('aria-label', 'Offset / Scale');
  await page.keyboard.press('Control+z');
  await expect(cards.first()).toHaveAttribute('aria-label', 'Smooth');
  await expect(rows.first()).toHaveAttribute('data-testid', secondId);
});
