import { expect, test } from '@playwright/test';

test('shared controls support keyboard, disabled explanations, dialog and feedback', async ({ page }) => {
 await page.goto('/tests/fixtures/phase2/');
 const actions=page.getByRole('button',{name:'Actions'}); await actions.focus(); await page.keyboard.press('ArrowDown');
 await expect(page.getByRole('menuitem',{name:'Open'})).toBeFocused(); await page.keyboard.press('Escape'); await expect(actions).toBeFocused();
 const grid=page.getByRole('radio',{name:'Grid'}); await expect(grid).toBeDisabled(); const wrapper=grid.locator('..'); await wrapper.focus(); await expect(page.getByRole('tooltip',{name:'Needs four panes'})).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('tooltip',{name:'Needs four panes'})).toBeHidden();
 await page.getByRole('button',{name:'Open dialog'}).click(); const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(page.getByRole('button',{name:'Open dialog'})).toBeFocused();
 await page.getByRole('button',{name:'Show toast'}).click(); await expect(page.getByText('Opened 2 files')).toBeVisible(); await page.getByRole('button',{name:'Undo'}).click(); await expect(page.getByText('Opened 2 files')).toBeHidden();
});

test('popovers stay in viewport and dismiss outside', async ({ page }) => {
 await page.goto('/tests/fixtures/phase2/'); const trigger=page.getByRole('button',{name:'Settings'}); await trigger.evaluate(el=>{ const e=el as HTMLElement; e.style.position='fixed'; e.style.right='0'; e.style.bottom='0'; }); await trigger.click(); const popup=page.getByText('Popover content'); await expect(popup).toBeVisible(); const box=await popup.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.x+box!.width).toBeLessThanOrEqual(1280); expect(box!.y+box!.height).toBeLessThanOrEqual(720); await page.mouse.click(10,10); await expect(popup).toBeHidden();
});
test('active and danger hover retain their roles and toast undo stays legible', async ({page}) => {
 await page.goto('/tests/fixtures/phase2/');
 for (const name of ['Marker','Armed','Delete']) { const button=page.getByRole('button',{name,exact:true}); const before=await button.evaluate(e=>getComputedStyle(e).backgroundColor); await button.hover(); await expect(button).toHaveCSS('background-color',before); }
 await page.getByRole('button',{name:'Show toast'}).click(); const undo=page.getByRole('button',{name:'Undo'}); await undo.hover(); const colors=await undo.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color})); expect(colors.bg).not.toBe('rgba(0, 0, 0, 0)'); expect(colors.bg).not.toBe(colors.fg);
});

test('long menus stay visible and track their anchor on resize and scroll', async ({page}) => {
 await page.goto('/tests/fixtures/phase2/'); const trigger=page.getByRole('button',{name:'Long menu'}); await trigger.click(); const menu=page.getByRole('menu'); await expect(menu).toBeVisible();
 let box=await menu.boundingBox(); expect(box).not.toBeNull(); expect(box!.height).toBeLessThanOrEqual(712); expect(box!.y).toBeGreaterThanOrEqual(0);
 await page.setViewportSize({width:800,height:500}); await expect.poll(async () => { const b=await menu.boundingBox(); return b!.height <= 492 && b!.y+b!.height <= 500; }).toBe(true);
 await trigger.evaluate(el => { (el as HTMLElement).style.transform='translateX(100px)'; window.dispatchEvent(new Event('scroll')); }); const triggerBox=await trigger.boundingBox(); box=await menu.boundingBox(); expect(Math.abs(box!.x-triggerBox!.x)).toBeLessThan(2);
 for (const y of [-1000, 2000]) { await trigger.evaluate((el, top) => { const e=el as HTMLElement; e.style.position='fixed'; e.style.top=`${top}px`; window.dispatchEvent(new Event('scroll')); },y); box=await menu.boundingBox(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y+box!.height).toBeLessThanOrEqual(500); }
});

test('disabled menu item retains neutral background on hover', async ({page}) => { await page.goto('/tests/fixtures/phase2/'); await page.getByRole('button',{name:'Actions'}).click(); const item=page.getByRole('menuitem',{name:'Export'}); const before=await item.evaluate(el=>getComputedStyle(el).backgroundColor); await item.hover(); await expect(item).toHaveCSS('background-color',before); });
