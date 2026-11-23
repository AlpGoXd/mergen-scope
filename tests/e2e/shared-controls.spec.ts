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
  await page.goto('/tests/fixtures/phase2/');
  const trigger = page.getByRole('button', { name: 'Long menu' });
  await expect(trigger).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  await trigger.click();

  const menu = page.getByRole('menu');
  // The menu effect positions the popup and installs its listeners before focusing the first item.
  await expect(menu.getByRole('menuitem', { name: 'Item 0', exact: true })).toBeFocused();
  await menu.evaluate(async element => {
    await document.fonts.ready;
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });

  const anchor = await trigger.elementHandle();
  if (!anchor) throw new Error('Long menu trigger disappeared');
  const expectMenuLayout = async (width: number, height: number) => {
    await expect.poll(() => menu.evaluate(async (element, viewport) => {
      const measure = () => {
        const { x, y, width, height } = element.getBoundingClientRect();
        const { x: anchorX, y: anchorY } = viewport.anchor.getBoundingClientRect();
        return { x, y, width, height, anchorX, anchorY };
      };
      const previous = measure();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const current = measure();
      return {
        stable: JSON.stringify(current) === JSON.stringify(previous),
        fitsViewport: current.x >= 0 && current.x + current.width <= viewport.width
          && current.y >= 0 && current.y + current.height <= viewport.height
          && current.height <= viewport.height - 8,
        followsAnchor: Math.abs(current.x - current.anchorX) < 2,
      };
    }, { width, height, anchor })).toEqual({ stable: true, fitsViewport: true, followsAnchor: true });
  };

  await expectMenuLayout(1280, 720);
  await page.setViewportSize({ width: 800, height: 500 });
  await expectMenuLayout(800, 500);

  await trigger.evaluate(el => {
    (el as HTMLElement).style.transform = 'translateX(100px)';
    window.dispatchEvent(new Event('scroll'));
  });
  await expectMenuLayout(800, 500);

  for (const position of [{ top: -1000, left: 100 }, { top: 2000, left: 200 }]) {
    await trigger.evaluate((el, { top, left }) => {
      const button = el as HTMLElement;
      button.style.position = 'fixed';
      button.style.top = `${top}px`;
      // The capped menu fits at the same Y for either edge. Change X to observe each re-anchor.
      button.style.left = `${left}px`;
      window.dispatchEvent(new Event('scroll'));
    }, position);
    await expectMenuLayout(800, 500);
  }
});

test('disabled menu item retains neutral background on hover', async ({page}) => { await page.goto('/tests/fixtures/phase2/'); await page.getByRole('button',{name:'Actions'}).click(); const item=page.getByRole('menuitem',{name:'Export'}); const before=await item.evaluate(el=>getComputedStyle(el).backgroundColor); await item.hover(); await expect(item).toHaveCSS('background-color',before); });
