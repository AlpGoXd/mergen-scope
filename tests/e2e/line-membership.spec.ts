import { expect, test } from '@playwright/test';
import { resolve } from 'path';

// LL-2 (board 37-P4c): a line is one record shown in one or more panes; no link icon or Link button.
// Placing puts it only in the clicked pane. Nothing is ever added automatically (not to X-linked panes, not to new panes).
test('a line goes only into the clicked pane, even with X-linked panes; more panes only through Show in; new panes get none', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();

  // The Link button and the row's link icon are gone.
  await expect(page.getByRole('button', { name: 'Link', exact: true })).toHaveCount(0);

  // Show the trace in Pane 2 as well, so Pane 1 and Pane 2 share an X group (and X zoom is shared by default).
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  const traceRow = page.locator('[data-testid^="trace-row-"]').first();
  await traceRow.getByTitle('Show in panes').click();
  await page.getByRole('menu', { name: 'Show in' }).getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'V-Line' }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 60 } });
  const vRow = page.getByTestId('ref-line-row-V1');
  await expect(vRow).toHaveCount(1);
  await expect(vRow).toContainText('Shown in P1');
  await expect(vRow).not.toContainText('P2');
  await expect(page.getByTestId('chart-plot-pane-2').locator('.ln-g')).toHaveCount(0);
  await expect(vRow.getByRole('button', { name: /link/i })).toHaveCount(0);

  // More panes only when the user ticks them in Show in.
  await vRow.getByRole('button', { name: 'V1: Show in…' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Pane 2/ }).click();
  await page.keyboard.press('Escape');
  await expect(vRow).toContainText('Shown in P1, P2');
  await expect(page.getByTestId('chart-plot-pane-2').locator('.ln-g')).toHaveCount(1);

  await page.getByRole('button', { name: 'H-Line' }).click();
  await page.getByTestId('chart-plot-pane-1').click({ position: { x: 260, y: 90 } });
  const hRow = page.getByTestId('ref-line-row-H1');
  await expect(hRow).toHaveCount(1);
  await expect(hRow).toContainText('P1');
  await expect(hRow).not.toContainText('P2');

  // A new pane never receives existing lines.
  await page.getByRole('button', { name: '+ Pane', exact: true }).click();
  await expect(vRow).toContainText('Shown in P1, P2');
  await expect(vRow).not.toContainText('P3');
  await expect(page.locator('[data-testid^="ref-line-row-"]')).toHaveCount(2);
});
