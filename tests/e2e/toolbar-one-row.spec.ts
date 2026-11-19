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

test('each open group is a square tint block around its pressed chip: control height + 4 px, 2 px above and below, 3 px at the ends, round tools inside', async ({ page }) => {
  await openApp(page, 2048);
  await expect.poll(() => rows(page)).toBe(1);
  const report = await page.locator('.tool-zone.is-open').evaluateAll(zones => zones.map((zone, index) => {
    const box = (el: Element) => el.getBoundingClientRect();
    const probe = (property: string, value: string) => { const span = document.createElement('span'); span.style.setProperty(property, value); document.body.appendChild(span); const out = getComputedStyle(span).getPropertyValue(property); span.remove(); return out; };
    const tone = /tool-zone--(\w+)/.exec(zone.className)![1]!;
    const root = getComputedStyle(document.documentElement);
    const zoneBox = box(zone), name = zone.querySelector('.tool-zone__chip')!, nameBox = box(name), nameStyle = getComputedStyle(name);
    const tools = Array.from(zone.querySelectorAll('.tool-zone__tools > *')).map(box);
    const style = getComputedStyle(zone), next = zones[index + 1], bar = zone.parentElement!.parentElement!;
    const barBox = box(bar), content = barBox.height - parseFloat(getComputedStyle(bar).borderBottomWidth);
    const mid = (rect: DOMRect) => rect.top + rect.height / 2;
    return {
      tone, control: parseFloat(root.getPropertyValue('--control-height')), small: parseFloat(root.getPropertyValue('--control-sm-height')), row: parseFloat(root.getPropertyValue('--top-row-height')), height: zoneBox.height,
      // Centred in the row, with the same space above and below, and it fits.
      above: zoneBox.top - barBox.top, below: barBox.top + content - zoneBox.bottom, content,
      radius: style.borderTopLeftRadius + style.borderBottomRightRadius, border: style.borderTopWidth, shadow: style.boxShadow, padding: style.padding,
      bg: style.backgroundColor === probe('background-color', `var(--${tone}-zone)`),
      inside: nameBox.left >= zoneBox.left && tools.every(tool => tool.right <= zoneBox.right + 0.01),
      centred: [nameBox, ...tools].every(rect => Math.abs(mid(rect) - mid(zoneBox)) <= 0.5),
      chipToFirst: Math.round((tools[0]?.left ?? 0) - nameBox.right), toolGaps: tools.slice(1).map((tool, i) => Math.round(tool.left - tools[i]!.right)), toolHeights: tools.map(tool => tool.height),
      lastToEdge: Math.round(zoneBox.right - tools[tools.length - 1]!.right), firstToEdge: Math.round(nameBox.left - zoneBox.left), toNext: next ? Math.round(box(next).left - zoneBox.right) : null,
      // The chip is the pressed state of the group's normal chip: the group's fill, line and ink, semibold, control height.
      name: {
        height: nameBox.height, radius: nameStyle.borderTopLeftRadius, radiusToken: root.getPropertyValue('--radius-control').trim(), weight: nameStyle.fontWeight, borderWidth: nameStyle.borderTopWidth,
        fill: nameStyle.backgroundColor === probe('background-color', `var(--${tone}-fill)`), line: nameStyle.borderTopColor === probe('border-top-color', `var(--${tone}-line)`), ink: nameStyle.color === probe('color', `var(--${tone}-ink)`),
        expanded: name.getAttribute('aria-expanded'),
      },
    };
  }));
  expect(report).toHaveLength(4);
  for (const zone of report) {
    expect(zone, zone.tone).toMatchObject({ height: zone.control + 4, radius: '0px0px', border: '0px', shadow: 'none', padding: '2px 3px', bg: true, inside: true, centred: true, chipToFirst: 4, lastToEdge: 3, firstToEdge: 3 });
    // 2 px above and below, and it fits inside the row.
    expect(zone.above, zone.tone).toBe(2);
    expect(zone.below, zone.tone).toBe(2);
    expect(zone.height, zone.tone).toBeLessThanOrEqual(zone.row);
    expect(zone.above + zone.height + zone.below, zone.tone).toBe(zone.content);
    expect(zone.toolGaps.every(gap => gap === 4), zone.tone).toBe(true);
    // The tools inside stay small.
    expect(zone.toolHeights.every(height => height === zone.small), zone.tone).toBe(true);
    // Its 3 px on the left come out of the 8 px before the group (the chip does not move), so two tint blocks are 5 px apart.
    if (zone.toNext !== null) expect(zone.toNext, zone.tone).toBe(5);
    expect(zone.name, zone.tone).toMatchObject({ height: zone.control, radius: zone.name.radiusToken, weight: '600', borderWidth: '1px', fill: true, line: true, ink: true, expanded: 'true' });
  }
});

test('wrapped, the zones sit 6 px apart vertically and never touch, one zone-high line each', async ({ page }) => {
  await openApp(page, 1024);
  const { zone, inset, content, zones } = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const zone = parseFloat(root.getPropertyValue('--control-height')) + 4;
    const bar = document.querySelector('.tool-groups')!.parentElement!;
    const barBox = bar.getBoundingClientRect(), borderBottom = parseFloat(getComputedStyle(bar).borderBottomWidth);
    const zones = Array.from(document.querySelectorAll('.tool-zone')).map(el => { const rect = el.getBoundingClientRect(); return { top: rect.top - barBox.top, height: rect.height, left: rect.left, right: rect.right }; });
    return { zone, inset: (parseFloat(root.getPropertyValue('--top-row-height')) - zone) / 2, content: barBox.height - borderBottom, zones };
  });
  const tops = [...new Set(zones.map(item => item.top))].sort((a, b) => a - b);
  expect(tops.length).toBeGreaterThan(1);
  // The first line is centred in the row; the next lines follow 6 px below the one before.
  expect(tops).toEqual(tops.map((_, line) => inset + line * (zone + 6)));
  expect(content).toBe(inset + tops.length * zone + (tops.length - 1) * 6 + inset);
  for (const item of zones) expect(item.height).toBe(zone);
  // Side by side the tint blocks are 5 px apart (8 px between the chips, less the 3 px of tint left of each chip).
  for (const top of tops) {
    const line = zones.filter(item => item.top === top).sort((a, b) => a.left - b.left);
    line.slice(1).forEach((item, i) => expect(Math.round(item.left - line[i]!.right)).toBe(5));
  }
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

test('Trace is one control with its label inside it, and a group chip keeps the same box closed and pressed', async ({ page }) => {
  await openApp(page, 2048);
  const trace = page.getByRole('combobox', { name: 'Trace', exact: true });
  await expect(trace).toHaveCount(1);
  const field = page.locator('.tool-zone__field');
  await expect(field).toContainText('Trace:');
  expect(await field.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await trace.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');

  const chip = page.getByRole('button', { name: 'Lines', exact: true });
  // The group chip keeps the SAME box closed and pressed: same size and position, padding, text size, label cell and
  // chevron box; only its colours change and the chevron flips. Semibold does not change its width.
  const read = () => chip.evaluate(el => {
    const rect = (node: Element) => { const box = node.getBoundingClientRect(); return [box.x, box.y, box.width, box.height]; };
    const style = getComputedStyle(el), chevron = el.querySelector('svg')!;
    return {
      box: rect(el), label: rect(el.querySelector('.tool-zone__label')!), chevron: rect(chevron), padding: style.padding, fontSize: style.fontSize, borderWidth: style.borderTopWidth, radius: style.borderTopLeftRadius,
      weight: style.fontWeight, background: style.backgroundColor, border: style.borderTopColor, color: style.color, flipped: getComputedStyle(chevron).transform !== 'none', expanded: el.getAttribute('aria-expanded'), name: el.getAttribute('aria-label') ?? el.textContent,
    };
  });
  const token = (name: string) => page.evaluate(variable => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name);
  const control = parseFloat(await token('--control-height'));
  const open = await read();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  // Let the chevron's 200 ms turn and the colour transitions finish.
  await expect.poll(async () => (await read()).flipped).toBe(false);
  const closed = await read();
  expect(open.box[3]).toBe(control);
  expect(closed).toMatchObject({ box: open.box, label: open.label, chevron: open.chevron, padding: open.padding, fontSize: open.fontSize, borderWidth: open.borderWidth, radius: await token('--radius-control') });
  expect(open).toMatchObject({ flipped: true, expanded: 'true', weight: '600' });
  expect(closed).toMatchObject({ flipped: false, expanded: 'false' });
  expect(closed.weight).not.toBe('600');
  // Only the colours change.
  expect(closed.background).not.toBe(open.background);
  expect(closed.border).not.toBe(open.border);
  expect(closed.color).not.toBe(open.color);
  // The accessible name is still just the label (the hidden semibold copy is aria-hidden).
  await expect(chip).toHaveAccessibleName('Lines');
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
    return { chip: mid(chip.querySelector('.tool-zone__label > span')!.firstChild!), tool: mid(label.firstChild!), size: getComputedStyle(chip).fontSize === getComputedStyle(label).fontSize };
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

test('Dir is a dashed setting button that flips the direction Next peak and Next min search in', async ({ page }) => {
  await openApp(page, 2048);
  const dir = page.getByRole('button', { name: /^Dir L/ });
  const peak = page.getByRole('button', { name: 'Peak', exact: true });
  await expect(dir).toHaveCount(1);
  await expect(dir).toHaveText('Dir L → R');
  await expect(dir).toHaveAttribute('title', 'Change search direction');
  // The only dashed button in the zones: it keeps the shared shape and changes only its border.
  expect(await dir.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  expect(await peak.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('solid');
  // The direction is the UI store's searchDirection: Next peak moves the marker up in frequency when it reads
  // L → R and down when it reads L ← R.
  const frequency = async () => Number(/([\d.]+) GHz/.exec(await page.getByTestId('marker-row-1').innerText())![1]);
  const nextPeak = async () => { const before = await frequency(); await page.getByRole('button', { name: 'Next peak', exact: true }).click(); await expect.poll(frequency).not.toBe(before); return frequency(); };
  await peak.click();
  await expect(page.getByTestId('marker-row-1')).toBeVisible();
  const start = await frequency();
  const up = await nextPeak();
  expect(up).toBeGreaterThan(start);
  await dir.click();
  await expect(dir).toHaveText('Dir L ← R');
  expect(await nextPeak()).toBeLessThan(up);
  await dir.click();
  await expect(dir).toHaveText('Dir L → R');
});

test('pressing a group chip moves nothing: not the chip, nothing to its left; the tools appear only to its right', async ({ page }) => {
  await openApp(page, 2048);
  const chip = page.getByRole('button', { name: 'Search', exact: true });
  const snapshot = () => page.evaluate(() => {
    const rect = (node: Element) => { const box = node.getBoundingClientRect(); return [box.x, box.y, box.width, box.height]; };
    const search = document.querySelector('.tool-zone--search')!;
    const left = Array.from(document.querySelectorAll('.tool-zone')).filter(zone => zone.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING);
    const fixed = Array.from(document.querySelectorAll('.topbar-panel-toggle, [data-testid="topbar-groups-divider"], [data-testid="topbar-workspace-input"] ~ button')).map(rect);
    return {
      chip: rect(search.querySelector('.tool-zone__chip')!), toolsLeft: left.map(zone => ({ zone: rect(zone), kids: Array.from(zone.querySelectorAll('button, .split-btn, .tool-zone__field')).map(rect) })),
      fixed: fixed.slice(0, 3), toolsRight: Array.from(search.querySelectorAll('.tool-zone__tools > *')).map(rect), tools: search.querySelectorAll('.tool-zone__tools').length,
    };
  });
  const open = await snapshot();
  expect(open.tools).toBe(1);
  expect(open.toolsLeft.length).toBe(1);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  const closed = await snapshot();
  expect(closed.tools).toBe(0);
  expect(closed.chip).toEqual(open.chip);
  expect(closed.toolsLeft).toEqual(open.toolsLeft);
  expect(closed.fixed).toEqual(open.fixed);
  // The tools sit to the right of the chip.
  for (const tool of open.toolsRight) expect(tool[0]!).toBeGreaterThan(open.chip[0]! + open.chip[2]!);
  // And opening it again brings them back without moving the chip.
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  expect((await snapshot()).chip).toEqual(open.chip);
});

for (const size of ['compact', 'comfortable', 'large'] as const) {
  test(`the zone fits the row and the chip keeps its box in ${size} size`, async ({ page }) => {
    await openApp(page, 2048);
    await page.evaluate(value => { document.documentElement.dataset['size'] = value; }, size);
    const chip = page.getByRole('button', { name: 'Search', exact: true });
    const measure = () => page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const zone = document.querySelector('.tool-zone--search')!, bar = zone.closest('.tool-groups')!.parentElement!;
      const box = zone.getBoundingClientRect(), barBox = bar.getBoundingClientRect(), chipBox = zone.querySelector('.tool-zone__chip')!.getBoundingClientRect();
      return { row: parseFloat(root.getPropertyValue('--top-row-height')), control: parseFloat(root.getPropertyValue('--control-height')), zone: box.height, above: box.top - barBox.top, below: barBox.top + barBox.height - parseFloat(getComputedStyle(bar).borderBottomWidth) - box.bottom, chip: [chipBox.x, chipBox.y, chipBox.width, chipBox.height] };
    });
    const open = await measure();
    // control height + 4 px, and it fits the row with the same room above and below (2 px) in every size.
    expect(open.zone).toBe(open.control + 4);
    expect(open.zone).toBeLessThanOrEqual(open.row);
    expect([open.above, open.below]).toEqual([(open.row - open.zone) / 2, (open.row - open.zone) / 2]);
    expect(open.chip[3]).toBe(open.control);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect((await measure()).chip).toEqual(open.chip);
  });
}
