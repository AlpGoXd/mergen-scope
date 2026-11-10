import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

for (const theme of ['light', 'dark'] as const) {
  test(`remove last pane and undo in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/app.html');
    const remove = page.getByRole('button', { name: '- Pane', exact: true });
    const add = page.getByRole('button', { name: '+ Pane', exact: true });
    await expect(remove).toBeDisabled();
    await expect(remove).toHaveAttribute('title', 'At least one pane must remain');
    for (let i = 0; i < 3; i++) await add.click();
    await expect(add).toBeDisabled();
    await remove.click();
    await expect(add).toBeEnabled();
    await page.keyboard.press('Control+z'); // removing an empty pane raises no toast
    await expect(add).toBeDisabled();
    await page.keyboard.press('Control+Shift+z');
    await expect(add).toBeEnabled();
    if (process.env.TOOLBAR_CAPTURE) await page.screenshot({ path: `docs/redesign/toolbar-pane-feedback/${theme}.png`, animations: 'disabled' });
  });
}

test('experimental limit supports eight panes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mergen-experimental-eight-panes', 'true'));
  await page.goto('/app.html');
  const add = page.getByRole('button', { name: '+ Pane', exact: true });
  for (let i = 0; i < 7; i++) await add.click();
  await expect(add).toBeDisabled();
  await page.getByRole('button', { name: '- Pane', exact: true }).click();
  await expect(add).toBeEnabled();
});


test('incompatible removal confirms and keeps a paneless line out of the remaining chart', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles({ name:'time.csv', mimeType:'text/csv', buffer:Buffer.from('Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n') });
  await page.getByRole('button',{name:'+ Pane',exact:true}).click();
  await page.getByTestId('chart-pane-pane-2').evaluate(target => {
    const transfer=new DataTransfer();
    transfer.items.add(new File(['Frequency (Hz),Magnitude (dBm)\n100,1\n200,2\n300,3\n'],'frequency.csv',{type:'text/csv'}));
    for(const type of ['dragenter','dragover','drop']) target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer}));
  });
  const pane2=page.getByTestId('chart-plot-pane-2');
  await expect(pane2).toBeVisible();
  await pane2.click({position:{x:260,y:100}});
  await page.getByRole('button',{name:'V-Line'}).click();
  await pane2.click({position:{x:260,y:100}});
  const line=page.getByTestId('ref-line-row-V1');
  await expect(line).toBeVisible();
  const pane1=page.getByTestId('chart-plot-pane-1');
  const before=await pane1.locator('.recharts-reference-line').count();
  page.once('dialog',dialog => dialog.dismiss());
  await page.getByRole('button',{name:'- Pane',exact:true}).click();
  await expect(pane2).toBeVisible();
  let confirmation='';
  page.once('dialog',dialog => { confirmation=dialog.message(); return dialog.accept(); });
  await page.getByRole('button',{name:'- Pane',exact:true}).click();
  expect(confirmation).toContain('not in a pane');
  await expect(pane2).toHaveCount(0);
  await expect(line).toContainText('Not in a pane');
  await expect(pane1.locator('.recharts-reference-line')).toHaveCount(before);
  await page.keyboard.press('Control+z'); // no toast when no trace moved
  await expect(pane2).toBeVisible();
  await expect(line).not.toContainText('Not in a pane');
  await page.keyboard.press('Control+Shift+z');
  await expect(line).toContainText('Not in a pane');
  await expect(pane1.locator('.recharts-reference-line')).toHaveCount(before);
  await page.getByRole('button',{name:'V-Line'}).click();
  await pane1.click({position:{x:260,y:100}});
  await expect(page.getByTestId('ref-line-row-V2')).toBeVisible();
});
