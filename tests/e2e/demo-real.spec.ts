import { expect, test } from '@playwright/test';

// The shipped demo-assets/demo.json, opened through the normal open-workspace path (no mocking).
for (const theme of ['light', 'dark'] as const) {
  test(`app.html?demo=1 opens the real demo workspace in ${theme}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => localStorage.setItem('mergen-theme-preference', value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app.html?demo=1');
    await expect(page).toHaveURL(/\/app\.html$/);
    const workspaceResponse = await page.request.get('/demo-assets/demo.json');
    const workspace = await workspaceResponse.json();
    expect(workspace.snapshot.activePaneId).toBe('pane-1');
    expect(workspace.snapshot.xZoomState).toMatchObject({ zoomAll: false, paneXZooms: { 'pane-1': { left: 1_100_000_000, right: 1_600_000_000 }, 'pane-3': { left: 0, right: 0.01 }, 'pane-4': { left: 1_419_900_000, right: 1_420_900_000 } } });
    expect(workspace.snapshot.yZoomState.paneYZooms).toMatchObject({ 'pane-1': { min: -30, max: 43 }, 'pane-3': { min: -1.15, max: 1.15 }, 'pane-4': { min: -100, max: 15 } });
    expect(workspace.snapshot.refLines[0]).toMatchObject({ type: 'h', label: 'H1', value: 37.1584200214581, paneIds: ['pane-1'] });
    expect(workspace.snapshot.markers.find((marker: { type: string }) => marker.type === 'delta').freq).toBeLessThan(1_600_000_000);

    // The saved 2 x 2 workspace opens with useful names and the transfer plot selected.
    for (const [paneId, title] of [
      ['pane-1', 'S21 Gain | 3 dB BW'],
      ['pane-2', 'S11 Match | Smith'],
      ['pane-3', 'Scope | 1 kHz + 5 kHz'],
      ['pane-4', 'Two-Tone | IP3'],
    ]) {
      await expect(page.getByTestId(`chart-pane-header-${paneId}`)).toContainText(title);
    }
    await expect(page.getByTestId('chart-pane-pane-1')).toBeVisible();
    await expect(page.getByTestId('chart-pane-header-pane-1')).toHaveClass(/is-target/);
    await expect(page.getByTestId('chart-pane-pane-2').getByTestId('smith-pane')).toBeVisible();
    await expect(page.getByTestId('chart-pane-pane-2').getByTestId('smith-range-label')).toContainText('1.200');
    await expect(page.getByRole('button', { name: /^Layout:/ })).toContainText(/2\s.\s2/);
    await expect(page.locator('[data-testid^="marker-row-"]')).toHaveCount(6);
    await expect(page.locator('[data-testid^="ref-line-row-"]')).toHaveCount(1);
    await expect(page.getByTestId('ref-line-row-H1')).toBeVisible();
    await expect(page.locator('.lp-trace.is-created')).toHaveCount(1);

    await page.screenshot({ path: testInfo.outputPath(`demo-${theme}.png`) });
    await page.getByRole('button', { name: 'Analysis', exact: true }).click();
    await expect(page.locator('.an-panel__count')).toHaveText('3');
    await expect(page.locator('.an-card').filter({ hasText: 'IP3' })).toContainText('OIP3');
    await expect(page.locator('.an-card').filter({ hasText: 'Bandwidth' }).locator('.an-result')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
