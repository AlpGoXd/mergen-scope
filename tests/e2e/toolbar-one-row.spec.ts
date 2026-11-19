import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

async function openApp(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/app.html');
  await page.getByTestId('app-open-input').setInputFiles(resolve('test files/cascade_ip3_-12dBm.DAT'));
  await expect(page.locator('[data-testid^="trace-row-"]').first()).toBeVisible();
  for (const name of ['Markers', 'Search', 'Lines', 'Pane']) {
    const chip = page.getByRole('button', { name, exact: true });
    if (await chip.getAttribute('aria-expanded') !== 'true') await chip.click();
  }
}

const rows = (page: Page) => page.locator('.tool-zone').evaluateAll(zones => new Set(zones.map(zone => Math.round(zone.getBoundingClientRect().y))).size);

test('each open group is a full-height square band around its chip and all its tools: 8 px padding, 4 px inside, 8 px apart', async ({ page }) => {
  await openApp(page, 2048);
  expect(await rows(page)).toBe(1);
  const report = await page.locator('.tool-zone.is-open').evaluateAll(zones => zones.map((zone, index) => {
    const box = (el: Element) => el.getBoundingClientRect();
    const zoneBox = box(zone), chip = box(zone.querySelector('.tool-zone__chip')!), tools = Array.from(zone.querySelectorAll('.tool-zone__tools > *')).map(box);
    const style = getComputedStyle(zone), next = zones[index + 1], bar = zone.parentElement!.parentElement!;
    const barBox = box(bar), barStyle = getComputedStyle(bar);
    return {
      height: zoneBox.height, row: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-row-height')),
      // The band touches the bar's top edge and its bottom border, with no vertical padding on the bar.
      top: zoneBox.top - barBox.top, bottom: barBox.bottom - parseFloat(barStyle.borderBottomWidth) - zoneBox.bottom, barPadding: [barStyle.paddingTop, barStyle.paddingBottom],
      radius: style.borderTopLeftRadius + style.borderBottomRightRadius, border: style.borderTopWidth, shadow: style.boxShadow, padding: style.padding,
      inside: chip.left >= zoneBox.left && tools.every(tool => tool.right <= zoneBox.right + 0.01),
      toolsCentred: tools.every(tool => Math.abs((tool.top + tool.height / 2) - (zoneBox.top + zoneBox.height / 2)) <= 0.5),
      chipToFirst: Math.round((tools[0]?.left ?? 0) - chip.right), toolGaps: tools.slice(1).map((tool, i) => Math.round(tool.left - tools[i]!.right)),
      lastToEdge: Math.round(zoneBox.right - tools[tools.length - 1]!.right), toNext: next ? Math.round(box(next).left - zoneBox.right) : 8,
    };
  }));
  expect(report).toHaveLength(4);
  for (const zone of report) {
    expect(zone).toMatchObject({ height: zone.row, top: 0, bottom: 0, barPadding: ['0px', '0px'], radius: '0px0px', border: '0px', shadow: 'none', padding: '0px 8px', inside: true, toolsCentred: true, chipToFirst: 4, lastToEdge: 8, toNext: 8 });
    expect(zone.toolGaps.every(gap => gap === 4)).toBe(true);
  }
});

test('wrapped, every line is one full row and each band fills its own line, with no gap between lines', async ({ page }) => {
  await openApp(page, 1024);
  const read = () => page.evaluate(() => {
    const row = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-row-height'));
    const bar = document.querySelector('.tool-groups')!.parentElement!;
    const barBox = bar.getBoundingClientRect(), borderBottom = parseFloat(getComputedStyle(bar).borderBottomWidth);
    const zones = Array.from(document.querySelectorAll('.tool-zone')).map(zone => ({ top: zone.getBoundingClientRect().top - barBox.top, height: zone.getBoundingClientRect().height, open: zone.classList.contains('is-open') }));
    return { row, content: barBox.height - borderBottom, zones };
  });
  const { row, content, zones } = await read();
  const tops = [...new Set(zones.map(zone => zone.top))].sort((a, b) => a - b);
  expect(tops.length).toBeGreaterThan(1);
  // Lines sit directly on top of each other, one row apart, starting at the bar's top edge and ending at its border.
  expect(tops).toEqual(tops.map((_, line) => line * row));
  expect(content).toBe(tops.length * row);
  for (const zone of zones) expect(zone.height).toBe(row);
});

test('only the groups wrap: Analysis stands alone at the right end and Clear All is gone from the top bar', async ({ page }) => {
  await openApp(page, 1024);
  expect(await rows(page)).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Clear All' })).toHaveCount(0);
  const [analysisBox, firstZone, barBox] = await Promise.all([page.getByRole('button', { name: 'Analysis', exact: true }).boundingBox(), page.locator('.tool-zone').first().boundingBox(), page.locator('.tool-groups').evaluate(el => el.parentElement!.getBoundingClientRect().toJSON() as { right: number })]);
  // On the first line (centred in the first row, like the first line of groups), at the right end of the bar (its 8 px padding), and no divider before it.
  expect((analysisBox?.y ?? 0) + (analysisBox?.height ?? 0) / 2).toBe((firstZone?.y ?? 0) + (firstZone?.height ?? 0) / 2);
  expect(Math.round(barBox.right - ((analysisBox?.x ?? 0) + (analysisBox?.width ?? 0)))).toBe(8);
  expect(await page.getByRole('button', { name: 'Analysis', exact: true }).evaluate(el => (el.previousElementSibling as HTMLElement | null)?.getAttribute('aria-hidden') ?? null)).toBeNull();
});

test('Trace is one control with its label inside it, and a group title does not move when it opens or closes', async ({ page }) => {
  await openApp(page, 2048);
  const trace = page.getByRole('combobox', { name: 'Trace', exact: true });
  await expect(trace).toHaveCount(1);
  const field = page.locator('.tool-zone__field');
  await expect(field).toContainText('Trace:');
  expect(await field.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await trace.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');

  const chip = page.getByRole('button', { name: 'Lines', exact: true });
  // The open title fills the band's height, the closed chip is the normal small chip (6 px corners); the label stays
  // exactly where it was, both across and down, so the row does not jump.
  const measure = () => chip.evaluate(el => {
    const box = el.getBoundingClientRect(), text = document.createRange();
    text.selectNodeContents(el.firstChild!);
    const label = text.getBoundingClientRect(), style = getComputedStyle(el);
    return { height: box.height, radius: style.borderTopLeftRadius, labelLeft: label.left, labelMid: label.top + label.height / 2 };
  });
  const open = await measure();
  const row = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-row-height')));
  expect(open).toMatchObject({ height: row, radius: '0px' });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  const closed = await measure();
  expect(closed.radius).toBe(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--radius-control').trim()));
  expect(closed.height).toBe(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-sm-height')) + 4));
  expect(closed.labelLeft).toBe(open.labelLeft);
  expect(closed.labelMid).toBe(open.labelMid);
});

test('Left and Analysis are panel toggles with their icon, and the wordmark is semibold', async ({ page }) => {
  await openApp(page, 1024);
  const left = page.getByRole('button', { name: 'Left', exact: true });
  const analysis = page.getByRole('button', { name: 'Analysis', exact: true });
  const group = page.getByRole('button', { name: 'Lines', exact: true });
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  for (const [button, path] of [[left, 'M3 4h18v16H3zM9 4v16'], [analysis, 'M3 4h18v16H3zM15 4v16']] as const) {
    const icon = button.locator('svg');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon.locator('path')).toHaveAttribute('d', path);
    expect(await icon.evaluate(el => { const style = getComputedStyle(el); return [el.getBoundingClientRect().width, style.strokeWidth, style.strokeLinecap, style.strokeLinejoin]; })).toEqual([13, '1.75px', 'round', 'round']);
    // The text stays visible at 1024 px, 5 px after the icon, and the chip is as tall as a (closed) group chip.
    const [iconBox, textGap, height] = await button.evaluate(el => { const svg = el.querySelector('svg')!.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(el.lastChild!); return [svg.right, Math.round(range.getBoundingClientRect().left - svg.right), el.getBoundingClientRect().height]; });
    expect(iconBox).toBeGreaterThan(0);
    expect(textGap).toBe(5);
    expect(height).toBe((await group.boundingBox())?.height);
  }
  // Off = neutral, on = the panel's chip colours; never the open-group zone look.
  const paint = (button: typeof left) => button.evaluate(el => { const style = getComputedStyle(el); return { bg: style.backgroundColor, border: style.borderTopColor, inZone: !!el.closest('.tool-zone') }; });
  await expect(analysis).toHaveAttribute('aria-pressed', 'false');
  const off = await paint(analysis);
  await analysis.click();
  await expect(analysis).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await paint(analysis)).bg).not.toBe(off.bg);
  expect((await paint(analysis)).inZone || off.inZone).toBe(false);
  const probe = (variable: string) => page.evaluate(name => { const span = document.createElement('span'); span.style.color = `var(${name})`; document.body.appendChild(span); const colour = getComputedStyle(span).color; span.remove(); return colour; }, variable);
  // Colours transition over 120 ms, so poll for the settled value.
  await expect.poll(() => analysis.evaluate(el => getComputedStyle(el).color)).toBe(await probe('--analysis-ink'));
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => left.evaluate(el => getComputedStyle(el).color)).toBe(await probe('--left-ink'));

  // Wordmark: semibold, accent "Scope", logo centred on the text.
  const brand = page.getByText('Mergen', { exact: false }).first();
  expect(await brand.evaluate(el => { const wrap = el.closest('span[style*="font-weight"]')!; const style = getComputedStyle(wrap); const logo = wrap.querySelector('svg')!.getBoundingClientRect(), text = wrap.lastElementChild!.getBoundingClientRect(); return { weight: style.fontWeight, centred: Math.abs((logo.top + logo.height / 2) - (text.top + text.height / 2)) <= 1 }; })).toEqual({ weight: '600', centred: true });
});

test('every control in an open zone shares one shape; only Dir (dashed border) and the split button (parts carry the padding) differ', async ({ page }) => {
  await openApp(page, 2048);
  const read = () => page.locator('.tool-zone.is-open .zone-tool').evaluateAll(tools => {
    const small = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-sm-height'));
    return {
      small, radius: getComputedStyle(document.documentElement).getPropertyValue('--radius-control').trim(),
      tools: tools.map(tool => {
        const style = getComputedStyle(tool), box = tool.getBoundingClientRect();
        return { name: tool.textContent!.trim().slice(0, 14), height: box.height, radius: style.borderTopLeftRadius, width: style.borderTopWidth, style: style.borderTopStyle, padding: style.padding, size: style.fontSize, line: style.lineHeight, sizing: style.boxSizing, split: tool.classList.contains('split-btn'), dir: tool.classList.contains('tool-zone__dir'), bg: style.backgroundColor, active: tool.classList.contains('is-active') || tool.classList.contains('is-armed') };
      }),
    };
  });
  const idle = await read();
  expect(idle.tools.length).toBe(13);
  for (const tool of idle.tools) {
    expect(tool, tool.name).toMatchObject({ height: idle.small, radius: idle.radius, width: '1px', size: '13px', line: '18px', sizing: 'border-box' });
    expect(tool.style, tool.name).toBe(tool.dir ? 'dashed' : 'solid');
    expect(tool.padding, tool.name).toBe(tool.split ? '0px' : '0px 7px');
  }
  // Plain buttons, the select's field, the Layout button and the split button all have the same flat white fill.
  const fills = new Set(idle.tools.filter(tool => !tool.dir).map(tool => tool.bg));
  expect(fills.size).toBe(1);

  // The inner parts of the split button and the native select have no box of their own.
  expect(await page.locator('.split-btn > *').evaluateAll(parts => parts.map(part => { const style = getComputedStyle(part); return [style.borderTopLeftRadius, style.borderTopWidth]; }))).toEqual([['0px', '0px'], ['0px', '0px'], ['0px', '0px']]);
  expect(await page.locator('.tool-zone__select').evaluate(el => { const style = getComputedStyle(el); return [style.borderTopLeftRadius, style.borderTopWidth, style.padding]; })).toEqual(['0px', '0px', '0px']);
  await expect(page.locator('.tool-zone .ui-select')).toHaveCount(0);

  // The border shows on hover for plain buttons, the select's field and the split button alike.
  for (const target of [page.getByRole('button', { name: 'Peak', exact: true }), page.locator('.tool-zone__field'), page.locator('.split-btn')]) {
    await target.hover();
    await expect.poll(() => target.evaluate(el => getComputedStyle(el).borderTopColor)).toBe(await page.evaluate(() => { const span = document.createElement('span'); span.style.color = 'var(--border-strong)'; document.body.appendChild(span); const colour = getComputedStyle(span).color; span.remove(); return colour; }));
  }

  // Armed tools keep the same shape, only the fill changes.
  await page.getByRole('button', { name: 'New Marker', exact: true }).click();
  const armed = await read();
  expect(armed.tools.map(tool => [tool.height, tool.radius, tool.width])).toEqual(idle.tools.map(tool => [tool.height, tool.radius, tool.width]));
  await page.getByRole('button', { name: 'V-Line', exact: true }).click();
  expect((await read()).tools.map(tool => [tool.height, tool.radius, tool.width])).toEqual(idle.tools.map(tool => [tool.height, tool.radius, tool.width]));

  // The zone title chip lines up with the tools' text: same size, same vertical position.
  const alignment = await page.locator('.tool-zone.is-open').evaluateAll(zones => zones.map(zone => {
    const mid = (el: Element) => { const range = document.createRange(); range.selectNodeContents(el); const box = range.getBoundingClientRect(); return [box.top + box.height / 2, box.bottom]; };
    const chip = zone.querySelector('.tool-zone__chip')!, first = zone.querySelector('.tool-zone__tools .zone-tool')!;
    const label = first.querySelector('.tool-zone__field-label') ?? first.querySelector('.split-btn__main') ?? first;
    return { chip: mid(chip.firstChild!), tool: mid(label.firstChild!), size: getComputedStyle(chip).fontSize === getComputedStyle(label).fontSize };
  }));
  for (const zone of alignment) expect(zone).toEqual({ chip: zone.tool, tool: zone.chip, size: true });
});

test('the divider before the groups grows with the row; the fixed clusters stay on the first line', async ({ page }) => {
  const measure = () => page.evaluate(() => {
    const box = (el: Element) => { const rect = el.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, mid: rect.top + rect.height / 2, height: rect.height }; };
    const bar = document.querySelector('.tool-groups')!.parentElement!;
    const barBox = bar.getBoundingClientRect();
    const dividers = Array.from(bar.querySelectorAll('[aria-hidden="true"]')).filter(el => getComputedStyle(el).borderLeftWidth === '1px');
    const named = (label: string) => Array.from(bar.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === label || button.textContent!.trim() === label)!;
    return {
      contentHeight: barBox.height - 1,
      lines: new Set(Array.from(document.querySelectorAll('.tool-zone')).map(zone => Math.round(zone.getBoundingClientRect().top))).size,
      leftDivider: box(dividers[0]!), groupsDivider: box(document.querySelector('[data-testid="topbar-groups-divider"]')!),
      mids: { brand: box(document.querySelector('svg[viewBox="0 0 24 24"]')!.parentElement!).mid, left: box(named('Left')).mid, open: box(named('Open')).mid, analysis: box(named('Analysis')).mid, firstZone: box(document.querySelector('.tool-zone')!).mid },
    };
  });

  // One line: the divider keeps its normal height, the same as the Left | Open divider, centred in the row.
  await openApp(page, 2048);
  const one = await measure();
  expect(one.lines).toBe(1);
  expect(one.groupsDivider.height).toBe(20);
  expect(one.groupsDivider.height).toBe(one.leftDivider.height);
  expect(one.groupsDivider.mid).toBe(one.leftDivider.mid);

  // Wrapped: it spans every line, with the same inset above and below, and the Left | Open divider stays short.
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect.poll(async () => (await measure()).lines).toBeGreaterThan(1);
  const wrapped = await measure();
  expect(wrapped.leftDivider.height).toBe(20);
  expect(wrapped.groupsDivider.top).toBe(one.groupsDivider.top);
  expect(wrapped.contentHeight - wrapped.groupsDivider.bottom).toBe(one.groupsDivider.top);
  expect(wrapped.groupsDivider.height).toBe(wrapped.contentHeight - 2 * one.groupsDivider.top);
  expect(wrapped.groupsDivider.height).toBeGreaterThan(2 * one.groupsDivider.height);

  // On both, brand, Left, Open, Analysis and the first line of groups share one centre line (the first line).
  for (const result of [one, wrapped]) {
    const mids = Object.values(result.mids);
    expect(Math.max(...mids) - Math.min(...mids)).toBeLessThanOrEqual(0.5);
  }
  expect(wrapped.mids.brand).toBe(one.mids.brand);
  expect(wrapped.mids.analysis).toBe(one.mids.analysis);
});

test('selects use the control radius like buttons; text inputs keep the input radius', async ({ page }) => {
  await openApp(page, 2048);
  const token = (name: string) => page.evaluate(variable => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name);
  const radius = (selector: string) => page.locator(selector).first().evaluate(el => getComputedStyle(el).borderTopLeftRadius);
  await page.getByTestId('chart-pane-pane-1').getByTitle('Pane settings').click();
  const select = page.getByLabel('Grid line style');
  await expect(select).toBeVisible();
  const control = await token('--radius-control');
  expect(await select.evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe(control);
  // Same corners as a small button, and the Trace field in the toolbar.
  expect(await page.getByRole('button', { name: 'Peak', exact: true }).evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe(control);
  expect(await radius('.tool-zone__field')).toBe(control);
  // Text inputs keep the input radius.
  expect(await radius('.pset-num')).toBe(await token('--radius-input'));
  expect(control).not.toBe(await token('--radius-input'));
});
