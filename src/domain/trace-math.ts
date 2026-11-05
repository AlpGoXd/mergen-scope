// ============================================================================
// Mergen Scope — Trace Math Functions
// ============================================================================
// Ported from: app-modules/trace-helpers.js (231 lines)
// Pure functions for interpolation, visible data, Y-range, and ticks.
// ============================================================================

import type { DataPoint, Trace } from "../types/trace.ts";
import type { ZoomWindow } from "../types/marker.ts";
import type { YDomain } from "../types/pane.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function precisionFromStep(step: number, maxDigits?: number): number {
  const s = Math.abs(Number(step));
  const digits = maxDigits != null ? Math.max(0, Math.floor(maxDigits)) : 12;
  if (!Number.isFinite(s) || s <= 0) return 6;
  if (s >= 1) return 6;
  return Math.min(digits, Math.max(0, Math.ceil(-Math.log10(s)) + 2));
}

function clampYValue(v: number): number | null {
  if (!Number.isFinite(v)) return null;
  return Math.max(-300, Math.min(300, v));
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/** Linearly interpolate a data point at a given X value between two points. */
export function interpolatePointAtX(
  a: DataPoint | null,
  b: DataPoint | null,
  x: number,
): DataPoint | null {
  if (
    !a || !b ||
    !Number.isFinite(x) ||
    !Number.isFinite(a.freq) || !Number.isFinite(b.freq) ||
    !Number.isFinite(a.amp) || !Number.isFinite(b.amp)
  ) {
    return null;
  }
  if (a.freq === b.freq) return { freq: x, amp: b.amp };
  const t = (x - a.freq) / (b.freq - a.freq);
  if (!Number.isFinite(t)) return null;
  return { freq: x, amp: a.amp + (b.amp - a.amp) * t };
}

// ---------------------------------------------------------------------------
// Visible trace data (with zoom clipping + edge interpolation)
// ---------------------------------------------------------------------------

/** Get trace data visible within a zoom window, with interpolated edge points. */
export function getVisibleTraceData(
  tr: Trace | null | undefined,
  zoom: ZoomWindow | null | undefined,
): readonly DataPoint[] {
  const data = tr && Array.isArray(tr.data) ? tr.data : [];
  if (!zoom || !Number.isFinite(zoom.left) || !Number.isFinite(zoom.right) || zoom.right <= zoom.left) {
    return data;
  }
  if (!data.length) return [];

  const left = zoom.left;
  const right = zoom.right;

  // Collect points inside the window
  const out: DataPoint[] = [];
  for (const p of data) {
    if (!p || !Number.isFinite(p.freq) || !Number.isFinite(p.amp)) continue;
    if (p.freq < left) continue;
    if (p.freq > right) break;
    out.push(p);
  }

  // Find bracketing indices for edge interpolation
  let leftIdx = -1;
  let rightIdx = -1;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d && Number.isFinite(d.freq)) {
      if (d.freq <= left) leftIdx = i;
      if (rightIdx === -1 && d.freq >= right) rightIdx = i;
    }
  }

  if (out.length) {
    // Interpolate left edge
    if (out[0]!.freq > left && leftIdx >= 0 && leftIdx + 1 < data.length) {
      const leftPt = interpolatePointAtX(data[leftIdx]!, data[leftIdx + 1]!, left);
      if (leftPt) out.unshift(leftPt);
    }
    // Interpolate right edge
    const last = out[out.length - 1]!;
    if (last.freq < right && rightIdx >= 0 && rightIdx - 1 >= 0) {
      const rightPt = interpolatePointAtX(data[rightIdx - 1]!, data[rightIdx]!, right);
      if (rightPt) out.push(rightPt);
    }
    return out;
  }

  // No points inside window — check if window is entirely within a segment
  if (leftIdx >= 0 && leftIdx + 1 < data.length) {
    const a = data[leftIdx]!;
    const b = data[leftIdx + 1]!;
    if (Number.isFinite(a.freq) && Number.isFinite(b.freq) && a.freq <= left && b.freq >= right) {
      const pLeft = interpolatePointAtX(a, b, left);
      const pRight = interpolatePointAtX(a, b, right);
      return [pLeft, pRight].filter((p): p is DataPoint => p !== null);
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Y-range computation
// ---------------------------------------------------------------------------

/** Compute a safe Y-axis range from visible traces. */
export function getSafeYRangeFromData(
  allTr: readonly Trace[],
  vis: Readonly<Record<string, boolean>>,
  zoom: ZoomWindow | null,
): YDomain | null {
  let mn = Infinity;
  let mx = -Infinity;
  let found = false;

  for (const tr of allTr) {
    if (!vis[tr.name]) continue;
    const d = getVisibleTraceData(tr, zoom);
    for (const p of d) {
      if (!p || !Number.isFinite(p.amp)) continue;
      const a = clampYValue(p.amp);
      if (a === null) continue;
      found = true;
      if (a < mn) mn = a;
      if (a > mx) mx = a;
    }
  }

  if (!found || !Number.isFinite(mn) || !Number.isFinite(mx)) return null;

  let span = mx - mn;
  if (!Number.isFinite(span) || span <= 0) {
    const center = (mn + mx) / 2;
    const centerMag = Math.max(Math.abs(center), 1e-12);
    const minHalfSpan = Math.max(centerMag * 0.02, 1e-12);
    mn = center - minHalfSpan;
    mx = center + minHalfSpan;
    span = mx - mn;
  }

  const mag = Math.max(Math.abs(mn), Math.abs(mx), 1e-12);
  const pad = Math.max(span * 0.08, mag * 0.01, 1e-12);
  const finalMn = clampYValue(mn - pad);
  const finalMx = clampYValue(mx + pad);

  if (
    finalMn === null || finalMx === null ||
    !Number.isFinite(finalMn) || !Number.isFinite(finalMx) ||
    finalMx <= finalMn
  ) {
    return null;
  }

  return { min: finalMn, max: finalMx };
}

// ---------------------------------------------------------------------------
// Y-domain sanitizer
// ---------------------------------------------------------------------------

/** Sanitize a Y-axis domain, returning null if invalid. */
export function sanitizeYDomain(z: YDomain | null | undefined): YDomain | null {
  if (!z || !Number.isFinite(z.min) || !Number.isFinite(z.max)) return null;
  const mn = clampYValue(z.min);
  const mx = clampYValue(z.max);
  if (mn === null || mx === null || !Number.isFinite(mn) || !Number.isFinite(mx) || mx <= mn) return null;
  const span = mx - mn;
  if (span < 1e-15 || span > 2000) return null;
  return { min: mn, max: mx };
}

// ---------------------------------------------------------------------------
// Nice tick computation
// ---------------------------------------------------------------------------

/** Compute nice tick values for a Y-axis domain. */
export function makeNiceTicks(
  domain: YDomain | null | undefined,
  count?: number,
): number[] | undefined {
  if (!domain || !Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) {
    return undefined;
  }

  const tickCount = Math.max(2, count ?? 9);
  const span = domain.max - domain.min;
  const rough = span / (tickCount - 1);
  if (!Number.isFinite(rough) || rough <= 0) return undefined;

  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rough))));
  const norm = rough / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  if (!Number.isFinite(step) || step <= 0) return undefined;

  const start = Math.floor(domain.min / step) * step;
  const end = Math.ceil(domain.max / step) * step;
  const ticks: number[] = [];
  const decimals = precisionFromStep(step, 12);

  for (let v = start; v <= end + step * 0.5; v += step) {
    const rounded = Number(v.toFixed(decimals));
    if (rounded >= domain.min - step * 0.25 && rounded <= domain.max + step * 0.25) {
      ticks.push(rounded);
    }
    if (ticks.length > tickCount + 4) break;
  }

  if (ticks.length < 2) {
    const fbDigits = precisionFromStep(span / (tickCount - 1), 12);
    return [Number(domain.min.toFixed(fbDigits)), Number(domain.max.toFixed(fbDigits))];
  }

  return ticks;
}

// ---------------------------------------------------------------------------
// Nice-step span snapping (for wheel zoom)
// ---------------------------------------------------------------------------

/** Shared tick count for grid, axes, and toolbar Div readouts (6 divisions). */
export const NICE_TICK_COUNT = 7;

/** Nice step value at integer index. Series 1, 2, 5 per decade. */
export function niceStepAtIndex(i: number): number {
  const base = [1, 2, 5] as const;
  const mod = ((i % 3) + 3) % 3;
  const power = Math.floor(i / 3);
  return base[mod]! * Math.pow(10, power);
}

/** Integer index of nice step closest to the given step (log-scale). */
export function nearestNiceStepIndex(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const approx = Math.round(Math.log10(step) * 3);
  let best = approx;
  let bestDiff = Infinity;
  for (let di = -3; di <= 3; di++) {
    const i = approx + di;
    const diff = Math.abs(Math.log(niceStepAtIndex(i) / step));
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

/** Step the span by one discrete nice level in the given direction.
 *  direction +1 = zoom out (bigger step), -1 = zoom in (smaller step). */
export function steppedSpan(
  currentSpan: number,
  direction: -1 | 1,
  tickCount: number = NICE_TICK_COUNT,
): number {
  if (!Number.isFinite(currentSpan) || currentSpan <= 0) return currentSpan;
  const divs = Math.max(1, tickCount - 1);
  const currentStep = currentSpan / divs;
  const i = nearestNiceStepIndex(currentStep);
  // If current step does not match the nice value at i, first snap to nearest
  // nice level in the requested direction instead of stepping past it.
  const currentNice = niceStepAtIndex(i);
  let targetIndex: number;
  if (direction > 0) {
    targetIndex = currentNice > currentStep * 1.001 ? i : i + 1;
  } else {
    targetIndex = currentNice < currentStep * 0.999 ? i : i - 1;
  }
  return niceStepAtIndex(targetIndex) * divs;
}

// ---------------------------------------------------------------------------
// Horizontal crossings
// ---------------------------------------------------------------------------

/** Find frequencies where a trace crosses a horizontal Y value. */
export function findHorizontalCrossings(
  tr: Trace | null | undefined,
  yVal: number,
  zoom: ZoomWindow | null | undefined,
): number[] {
  const data = getVisibleTraceData(tr, zoom).filter(
    (p): p is DataPoint => !!p && Number.isFinite(p.freq) && Number.isFinite(p.amp),
  );
  if (data.length < 2 || !Number.isFinite(yVal)) return [];

  const out: number[] = [];

  function pushFreq(freq: number): void {
    if (!Number.isFinite(freq)) return;
    for (const existing of out) {
      if (Math.abs(existing - freq) <= 1e-9) return;
    }
    out.push(freq);
  }

  for (let i = 0; i < data.length; i++) {
    const d = data[i]!;
    if (d.amp === yVal) pushFreq(d.freq);
    if (i === 0) continue;
    const a = data[i - 1]!;
    const b = d;
    const da = a.amp - yVal;
    const db = b.amp - yVal;
    if (da === 0 || db === 0) continue;
    if (da * db < 0) {
      if (Number.isFinite(a.freq) && Number.isFinite(b.freq) && b.amp !== a.amp) {
        const freq = a.freq + (b.freq - a.freq) * ((yVal - a.amp) / (b.amp - a.amp));
        pushFreq(freq);
      }
    }
  }

  return out;
}

/** 
 * Clean and sort trace data points. Ensures sorted by frequency and unique.
 * Ported from file-store-helpers.js.
 */
export function normalizeTraceData(data: readonly DataPoint[]): DataPoint[] {
  if (!Array.isArray(data) || !data.length) return [];
  const rows = data
    .filter((d) => d && Number.isFinite(d.freq) && Number.isFinite(d.amp))
    .map((d) => ({ freq: d.freq, amp: d.amp }));
  
  rows.sort((a, b) => a.freq - b.freq);

  const out: DataPoint[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.freq === row.freq) {
      out[out.length - 1] = row;
    } else {
      out.push(row);
    }
  }
  return out;
}
