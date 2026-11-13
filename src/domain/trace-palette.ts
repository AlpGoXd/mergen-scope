// Trace colour allocation (design decisions 2026-11-10, "Trace colours").
// Pure and deterministic: the caller passes the traces on screen, in display order, plus the
// previous assignments, and gets stable assignments back. No React, no stores.
//
// Sources: 8 hues in a fixed order; a new source takes the first slot not in use; a trace keeps
// its slot; freed slots are reused first. Past 8, slots repeat in "rounds" and the round number
// drives the trace symbol.
// Created traces (ƒ): their own 8 hues between the source hues, in the created tone. Starting at
// the parent's hue: one step forward, one step back, then onward forward, skipping slots in use.
// Traces are never dashed.

export const SOURCE_HUES = [270, 0, 90, 180, 315, 45, 135, 225] as const;
/** The created ring, ascending by angle: 22.5°, 67.5°, …, 337.5°. */
export const CREATED_HUES = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5] as const;
export const TRACE_SYMBOLS = ['circle', 'square', 'triangle', 'diamond', 'triangle-down', 'plus', 'cross', 'star'] as const;
export type TraceSymbol = (typeof TRACE_SYMBOLS)[number];
export type SymbolSetting = 'off' | 'repeat' | 'always';
export type Theme = 'light' | 'dark';

export interface PaletteTrace {
  readonly id: string;
  /** 'raw' = read from a file (a source); 'derived' = created by a Math tool (ƒ). */
  readonly kind: 'raw' | 'derived';
  /** Parents, first one decides the colour neighbourhood. Only used for derived traces. */
  readonly sourceTraceIds?: readonly string[];
}

export interface TraceColorAssignment {
  readonly palette: 'source' | 'created';
  /** Index into SOURCE_HUES or CREATED_HUES. */
  readonly index: number;
  /** 0 for the first use of a colour, 1 for its first repeat, … */
  readonly round: number;
  readonly hue: number;
}

const slotKey = (a: Pick<TraceColorAssignment, 'palette' | 'index' | 'round'>): string => `${a.palette}:${a.round}:${a.index}`;
const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Created-ring index of the first step forward from a hue (source or created). */
function forwardStart(parentHue: number): number {
  const h = mod(parentHue, 360);
  // First created hue strictly after the parent's hue.
  for (let i = 0; i < CREATED_HUES.length; i++) if (CREATED_HUES[i]! > h + 1e-9) return i;
  return 0;
}

/** Ring order for children of a parent: F, F−1, F+1, F+2, … (8 distinct indices). */
export function createdOrder(parentHue: number): number[] {
  const n = CREATED_HUES.length;
  const f = forwardStart(parentHue);
  const back = mod(f - 1, n);
  const order = [f, back];
  for (let step = 1; order.length < n; step++) {
    const i = mod(f + step, n);
    if (!order.includes(i)) order.push(i);
  }
  return order;
}

/**
 * Assign colours to the traces on screen. `previous` keeps colours stable across calls: a trace
 * that already has an assignment keeps it. Pass the result back in as `previous` next time.
 */
export function allocateTraceColors(
  traces: readonly PaletteTrace[],
  previous: ReadonlyMap<string, TraceColorAssignment> = new Map(),
): Map<string, TraceColorAssignment> {
  const out = new Map<string, TraceColorAssignment>();
  const used = new Set<string>();
  const present = new Set(traces.map((t) => t.id));
  const byId = new Map(traces.map((t) => [t.id, t]));

  // 1. Keep previous assignments of traces still present (in order, first claim wins).
  for (const t of traces) {
    const prev = previous.get(t.id);
    if (!prev) continue;
    const expected = t.kind === 'raw' ? 'source' : 'created';
    if (prev.palette !== expected || used.has(slotKey(prev))) continue;
    out.set(t.id, prev);
    used.add(slotKey(prev));
  }

  // 2. New sources: first free slot, round by round, in the fixed hue order.
  for (const t of traces) {
    if (t.kind !== 'raw' || out.has(t.id)) continue;
    for (let round = 0; ; round++) {
      const index = SOURCE_HUES.findIndex((_, i) => !used.has(slotKey({ palette: 'source', index: i, round })));
      if (index >= 0) {
        const a: TraceColorAssignment = { palette: 'source', index, round, hue: SOURCE_HUES[index]! };
        out.set(t.id, a); used.add(slotKey(a)); break;
      }
    }
  }

  // 3. Created traces: walk from the parent's hue (parents first; cycles fall back to 270°).
  const assignCreated = (t: PaletteTrace, visiting: Set<string>): TraceColorAssignment => {
    const existing = out.get(t.id);
    if (existing) return existing;
    let parentHue: number = SOURCE_HUES[0];
    const parentId = t.sourceTraceIds?.find((id) => id !== t.id && present.has(id));
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent && !visiting.has(parent.id)) {
      visiting.add(t.id);
      parentHue = parent.kind === 'raw' ? (out.get(parent.id)?.hue ?? SOURCE_HUES[0]) : assignCreated(parent, visiting).hue;
    }
    const order = createdOrder(parentHue);
    for (let round = 0; ; round++) {
      const index = order.find((i) => !used.has(slotKey({ palette: 'created', index: i, round })));
      if (index !== undefined) {
        const a: TraceColorAssignment = { palette: 'created', index, round, hue: CREATED_HUES[index]! };
        out.set(t.id, a); used.add(slotKey(a)); return a;
      }
    }
  };
  for (const t of traces) if (t.kind === 'derived') assignCreated(t, new Set());
  return out;
}

/** Which symbol a trace shows for the user's setting (App settings › Colours › Trace symbols). */
export function symbolFor(a: TraceColorAssignment, setting: SymbolSetting): TraceSymbol | null {
  if (setting === 'off') return null;
  if (setting === 'repeat') return a.round > 0 ? TRACE_SYMBOLS[mod(a.round - 1, TRACE_SYMBOLS.length)]! : null;
  return TRACE_SYMBOLS[mod(a.index + a.round, TRACE_SYMBOLS.length)]!;
}

// ---------- colour strings ----------

const TONE = {
  source: { light: { l: 0.58, c: 0.16 }, dark: { l: 0.75, c: 0.13 } },
  created: { light: { l: 0.46, c: 0.15 }, dark: { l: 0.84, c: 0.10 } },
} as const;

/** Whether an OKLCH colour fits the sRGB gamut. */
export function inSrgb(l: number, c: number, h: number): boolean {
  const angle = (h * Math.PI) / 180, a = c * Math.cos(angle), b = c * Math.sin(angle);
  const x = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const y = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const z = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z,
  ];
  return rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);
}

/** Largest chroma ≤ `c` that the screen can show at this lightness and hue. */
export function clampChroma(l: number, c: number, h: number): number {
  if (inSrgb(l, c, h)) return c;
  let lo = 0, hi = c;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inSrgb(l, mid, h)) lo = mid; else hi = mid; }
  return Math.floor(lo * 10000) / 10000;
}

/** The CSS colour of an assignment, e.g. "oklch(0.58 0.16 270)". */
export function traceColor(a: TraceColorAssignment, theme: Theme): string {
  const { l, c } = TONE[a.palette][theme];
  return `oklch(${l} ${clampChroma(l, c, a.hue)} ${a.hue})`;
}

/** Line width in px: sources 1.5, created traces 2. Never dashed. */
export function traceWidth(a: TraceColorAssignment): number {
  return a.palette === 'created' ? 2 : 1.5;
}
