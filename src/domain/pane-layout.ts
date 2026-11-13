export type PresetId = 'rows' | 'columns' | 'grid' | 'one-side';

export function presetFits(preset: PresetId, paneCount: number, limit: number): { ok: true } | { ok: false; reason: string } {
  if (paneCount > limit) return { ok: false, reason: `Maximum ${limit} panes` };
  if (paneCount > 4 && (preset === 'grid' || preset === 'one-side')) return { ok: false, reason: 'More than 4 panes: only Rows and Columns' };
  if (preset === 'grid' && paneCount !== 4) return { ok: false, reason: '2 × 2 needs exactly 4 panes' };
  if (preset === 'one-side' && (paneCount < 3 || paneCount > 4)) return { ok: false, reason: '1 + side needs 3 or 4 panes' };
  return { ok: true };
}

export function availablePresets(paneCount: number, limit: number) {
  return (['rows', 'columns', 'grid', 'one-side'] as const).map(preset => ({ preset, ...presetFits(preset, paneCount, limit) }));
}

export function fallbackPreset(current: PresetId, paneCount: number, limit: number): PresetId {
  return presetFits(current, paneCount, limit).ok ? current : 'rows';
}

export function defaultTitle(index: number): string { return `Pane ${index + 1}`; }
export function isDefaultTitle(title: string): boolean { return /^Pane [1-9]\d*$/.test(title); }
export function renumberTitles<T extends { title: string }>(panes: readonly T[]): T[] {
  return panes.map((pane, index) => isDefaultTitle(pane.title) ? { ...pane, title: defaultTitle(index) } : pane);
}

/**
 * True means the pane keeps its X tick labels. In Rows, a pane hides them only when the pane below is in the same
 * X link group and shows the same known unit: linked panes always share one X range, so the bottom one labels it.
 */
export function xTickVisibility(preset: PresetId, panes: readonly { xUnit: string | null; xLinkGroup: string | null }[]): boolean[] {
  return panes.map((pane, index) => {
    const below = panes[index + 1];
    return preset !== 'rows' || !pane.xLinkGroup || !pane.xUnit || below?.xLinkGroup !== pane.xLinkGroup || below.xUnit !== pane.xUnit;
  });
}

export type LayoutSizes = { kind: 'rows' | 'columns'; tracks: number[] } | { kind: 'grid'; cols: number[]; rows: number[] } | { kind: 'one-side'; main: number; stack: number[] };
export type Divider = { key: string; orientation: 'horizontal' | 'vertical'; tracks: [number, number] };
const sequence = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
const equal = (n: number) => sequence(n).map(() => 1 / n);

export function arrange(preset: PresetId, paneCount: number) {
  const panes = sequence(paneCount);
  const dividers: Divider[] = [];
  if (preset === 'rows' || preset === 'columns') {
    for (let i = 1; i < paneCount; i++) dividers.push({ key: `${preset}:${i}`, orientation: preset === 'rows' ? 'horizontal' : 'vertical', tracks: [i - 1, i] });
    return { kind: preset, panes, dividers };
  }
  if (preset === 'grid') return { kind: preset, panes: [[0, 1], [2, 3]], dividers: [{ key: 'grid:v', orientation: 'vertical', tracks: [0, 1] }, { key: 'grid:h:0', orientation: 'horizontal', tracks: [0, 1] }] as Divider[] };
  dividers.push({ key: 'side:v', orientation: 'vertical', tracks: [0, 1] });
  for (let i = 1; i < paneCount - 1; i++) dividers.push({ key: `side:h:${i}`, orientation: 'horizontal', tracks: [i - 1, i] });
  return { kind: preset, main: 0, stack: panes.slice(1), dividers };
}

export function equalSizes(preset: PresetId, n: number): LayoutSizes {
  if (preset === 'grid') return { kind: preset, cols: equal(2), rows: equal(2) };
  if (preset === 'one-side') return { kind: preset, main: 0.5, stack: equal(n - 1) };
  return { kind: preset, tracks: equal(n) };
}

export function flattenLayoutSizes(sizes: LayoutSizes): Record<string, number> {
  const result: Record<string, number> = {};
  const add = (prefix: string, values: number[]) => values.forEach((value, index) => { result[`${prefix}${index}`] = value; });
  if (sizes.kind === 'grid') { add('grid:c', sizes.cols); add('grid:r', sizes.rows); }
  else if (sizes.kind === 'one-side') { result['side:main'] = sizes.main; add('side:s', sizes.stack); }
  else add(`${sizes.kind}:`, sizes.tracks);
  return result;
}

function normalized(values: readonly number[], count: number): number[] {
  if (values.length !== count || values.some(v => !Number.isFinite(v) || v <= 0 || v > 1e6)) return equal(count);
  const sum = values.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum <= 0) return equal(count);
  return values.map(v => v / sum);
}
export function normalizeSizes(preset: PresetId, n: number, saved: LayoutSizes | undefined): LayoutSizes {
  if (!saved || saved.kind !== preset) return equalSizes(preset, n);
  if (saved.kind === 'grid') return { kind: 'grid', cols: normalized(saved.cols, 2), rows: normalized(saved.rows, 2) };
  if (saved.kind === 'one-side') return { kind: 'one-side', main: Number.isFinite(saved.main) && saved.main > 0 && saved.main < 1 ? saved.main : 0.5, stack: normalized(saved.stack, n - 1) };
  return { kind: saved.kind, tracks: normalized(saved.tracks, n) };
}

function dividerTracks(sizes: LayoutSizes, key: string): { values: number[]; index: number; put: (values: number[]) => LayoutSizes } | undefined {
  if ((sizes.kind === 'rows' || sizes.kind === 'columns') && key.startsWith(`${sizes.kind}:`)) return { values: sizes.tracks, index: Number(key.slice(sizes.kind.length + 1)) - 1, put: tracks => ({ ...sizes, tracks }) };
  if (sizes.kind === 'grid' && key === 'grid:v') return { values: sizes.cols, index: 0, put: cols => ({ ...sizes, cols }) };
  if (sizes.kind === 'grid' && key === 'grid:h:0') return { values: sizes.rows, index: 0, put: rows => ({ ...sizes, rows }) };
  if (sizes.kind === 'one-side' && key === 'side:v') return { values: [sizes.main, 1 - sizes.main], index: 0, put: values => ({ ...sizes, main: values[0] ?? sizes.main }) };
  if (sizes.kind === 'one-side' && key.startsWith('side:h:')) return { values: sizes.stack, index: Number(key.slice(7)) - 1, put: stack => ({ ...sizes, stack }) };
  return undefined;
}
export function moveDivider(sizes: LayoutSizes, key: string, deltaPx: number, containerPx: number, minPx: number): LayoutSizes {
  const track = dividerTracks(sizes, key);
  if (!track || !Number.isInteger(track.index) || containerPx <= 0 || !Number.isFinite(deltaPx)) return sizes;
  const a = track.values[track.index], b = track.values[track.index + 1];
  if (a === undefined || b === undefined) return sizes;
  const min = Math.min(Math.max(0, minPx / containerPx), (a + b) / 2);
  const next = Math.max(min, Math.min(a + b - min, a + deltaPx / containerPx));
  const values = [...track.values]; values[track.index] = next; values[track.index + 1] = a + b - next;
  return track.put(values);
}
export function splitPercentages(sizes: LayoutSizes, key: string): [number, number] | undefined {
  const track = dividerTracks(sizes, key);
  if (!track) return undefined;
  const a = track.values[track.index], b = track.values[track.index + 1];
  if (a === undefined || b === undefined || a + b <= 0) return undefined;
  // Percentages describe the adjacent pair, relative to their combined space.
  const first = Math.round(100 * a / (a + b));
  return [first, 100 - first];
}
