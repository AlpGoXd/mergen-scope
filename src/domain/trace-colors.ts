import type { Trace } from '../types/trace';

const SOURCE_HUES = [270, 0, 90, 180, 315, 45, 135, 225] as const;
const FAMILY_OFFSETS = [22.5, -22.5, 67.5, -67.5] as const;
const hue = (value: number) => (value % 360 + 360) % 360;
const distance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Convert OKLCH to linear sRGB to find the maximum displayable chroma. */
function inSrgb(l: number, c: number, h: number): boolean {
  const angle = h * Math.PI / 180, a = c * Math.cos(angle), b = c * Math.sin(angle);
  const x = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const y = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const z = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z, -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z, -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z];
  return channels.every(channel => channel >= 0 && channel <= 1);
}

export function createdTraceColor(h: number, theme: 'light' | 'dark'): string {
  const l = theme === 'dark' ? 0.88 : 0.36;
  const maximum = theme === 'dark' ? 0.045 : 0.10;
  let low = 0, high = maximum;
  for (let i = 0; i < 24; i++) { const mid = (low + high) / 2; if (inSrgb(l, mid, hue(h))) low = mid; else high = mid; }
  const chroma = Math.floor(low * 100000) / 100000;
  return `oklch(${l} ${chroma} ${hue(h)})`;
}

/** Allocation follows stable trace identities and lineage, never sample arrays. */
export function makeTraceColorResolver(traces: readonly Trace[], sourcePalette: readonly string[], _derivedPalette: readonly string[], overrides: Readonly<Record<string, string>> = {}, theme: 'light' | 'dark' = 'light') {
  const sources = traces.filter(trace => trace.kind === 'raw');
  const derived = traces.filter(trace => trace.kind === 'derived');
  const hues = new Map<string, number>();
  const used = new Set<number>();
  sources.forEach((trace, index) => hues.set(trace.id, SOURCE_HUES[index % SOURCE_HUES.length]!));
  const byId = new Map(traces.map(trace => [trace.id, trace]));
  const pending = [...derived].sort((a, b) => a.id.localeCompare(b.id));
  const assign = (trace: Trace, visiting = new Set<string>()): number => {
    const existing = hues.get(trace.id); if (existing !== undefined) return existing;
    if (visiting.has(trace.id)) return SOURCE_HUES[0];
    visiting.add(trace.id);
    const parents = [...new Set(trace.sourceTraceIds)].map(id => byId.get(id)).filter((item): item is Trace => !!item && item.id !== trace.id);
    const parentHues = parents.map(parent => assign(parent, new Set(visiting)));
    const first = parentHues[0] ?? SOURCE_HUES[0];
    const second = parentHues[1];
    const midpoint = second === undefined ? first : hue(first + (((second - first + 540) % 360) - 180) / 2);
    const bases = second === undefined ? [first] : [first, second];
    const candidates = bases.flatMap(base => FAMILY_OFFSETS.map(offset => hue(base + offset)));
    const free = candidates.filter(candidate => !used.has(candidate));
    // If four family positions are occupied, continue on the same 22.5-degree lattice.
    const pool = free.length ? free : Array.from({ length: 16 }, (_, index) => hue(first + 22.5 * (index + 1))).filter(candidate => !used.has(candidate));
    const ordered = second === undefined ? pool : [...pool].sort((a, b) => distance(a, midpoint) - distance(b, midpoint));
    const chosen = ordered[0] ?? hue(first + 22.5);
    hues.set(trace.id, chosen); used.add(chosen); return chosen;
  };
  pending.forEach(trace => assign(trace));
  return (trace: Trace): string => {
    const override = overrides[trace.name]; if (override) return override;
    if (trace.kind === 'raw') { const index = sources.findIndex(item => item.id === trace.id); return sourcePalette[Math.max(0, index) % (sourcePalette.length || 1)] || 'var(--accent)'; }
    return createdTraceColor(hues.get(trace.id) ?? SOURCE_HUES[0], theme);
  };
}
