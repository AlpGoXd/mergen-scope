// ============================================================================
// Mergen Scope — Trace Operations
// ============================================================================
// Ported from: app-modules/trace-ops-helpers.js (235 lines)
// Smoothing, binary trace math, and interpolation helpers.
// ============================================================================

import type { DataPoint } from "../types/trace.ts";
import { interpolatePointAtX } from "./trace-math.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Smoothing method. */
export type SmoothingMethod = "none" | "moving-average" | "median-filter" | "savitzky-golay";

/** Interpolation method for binary trace math. */
export type InterpolationMethod = "auto" | "exact" | "linear" | "nearest" | "previous" | "next" | "cubic";

/** Binary trace math operation. */
export type BinaryOp = "add" | "subtract" | "multiply" | "divide";

/** Result of smoothing. */
export interface SmoothResult {
  readonly data: readonly DataPoint[];
  readonly window: number;
  readonly polyOrder: number | null;
}

/** Result of binary trace math computation. */
export interface BinaryTraceMathResult {
  readonly data?: readonly DataPoint[];
  readonly error?: string;
  readonly appliedInterpolation?: string;
  readonly droppedPoints?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ampsFromExactMatch(data: readonly DataPoint[], freq: number): number | null {
  for (const p of data) {
    if (p && Number.isFinite(p.freq) && p.freq === freq && Number.isFinite(p.amp)) return p.amp;
    if (p && Number.isFinite(p.freq) && p.freq > freq) break;
  }
  return null;
}

function cubicInterpolateSegment(
  p0: DataPoint | null,
  p1: DataPoint,
  p2: DataPoint,
  p3: DataPoint | null,
  x: number,
): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(p1.freq) || !Number.isFinite(p2.freq) || p1.freq === p2.freq) {
    return null;
  }
  const t = (x - p1.freq) / (p2.freq - p1.freq);
  if (!Number.isFinite(t)) return null;
  const y0 = (p0 && Number.isFinite(p0.amp)) ? p0.amp : p1.amp;
  const y1 = p1.amp;
  const y2 = p2.amp;
  const y3 = (p3 && Number.isFinite(p3.amp)) ? p3.amp : p2.amp;
  return 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t * t * t);
}

function interpolateAmpAtFreq(
  data: readonly DataPoint[],
  freq: number,
  method: InterpolationMethod,
): number | null {
  if (!data.length || !Number.isFinite(freq)) return null;
  const mode = method ?? "linear";
  let prev: DataPoint | null = null;

  for (let i = 0; i < data.length; i++) {
    const p = data[i]!;
    if (!Number.isFinite(p.freq) || !Number.isFinite(p.amp)) continue;
    if (p.freq === freq) return p.amp;
    if (p.freq > freq) {
      if (!prev) return null;
      if (mode === "exact") return null;
      if (mode === "nearest") return Math.abs(freq - prev.freq) <= Math.abs(p.freq - freq) ? prev.amp : p.amp;
      if (mode === "previous") return prev.amp;
      if (mode === "next") return p.amp;
      if (mode === "cubic") {
        let p0: DataPoint | null = null;
        let p3: DataPoint | null = null;
        for (let j = i - 2; j >= 0; j--) {
          const d = data[j]!;
          if (Number.isFinite(d.freq) && Number.isFinite(d.amp)) { p0 = d; break; }
        }
        for (let k = i + 1; k < data.length; k++) {
          const d = data[k]!;
          if (Number.isFinite(d.freq) && Number.isFinite(d.amp)) { p3 = d; break; }
        }
        const cubicAmp = cubicInterpolateSegment(p0, prev, p, p3, freq);
        if (Number.isFinite(cubicAmp) && cubicAmp !== null) return cubicAmp;
      }
      // Fallback to linear
      const ip = interpolatePointAtX(prev, p, freq);
      return ip && Number.isFinite(ip.amp) ? ip.amp : null;
    }
    prev = p;
  }
  return null;
}

function getOverlapWindow(
  aData: readonly DataPoint[],
  bData: readonly DataPoint[],
): { left: number; right: number } | null {
  if (!aData.length || !bData.length) return null;
  const left = Math.max(aData[0]!.freq, bData[0]!.freq);
  const right = Math.min(aData[aData.length - 1]!.freq, bData[bData.length - 1]!.freq);
  return (Number.isFinite(left) && Number.isFinite(right) && right >= left) ? { left, right } : null;
}

function getDataInWindow(
  data: readonly DataPoint[],
  window: { left: number; right: number } | null,
): DataPoint[] {
  if (!window) return [];
  return data.filter(
    (p) => p && Number.isFinite(p.freq) && p.freq >= window.left && p.freq <= window.right && Number.isFinite(p.amp),
  );
}

function overlapArraysMatchExactly(
  aData: readonly DataPoint[],
  bData: readonly DataPoint[],
): boolean {
  if (aData.length !== bData.length || !aData.length) return false;
  for (let i = 0; i < aData.length; i++) {
    if (aData[i]!.freq !== bData[i]!.freq) return false;
  }
  return true;
}

function normalizeOddWindowSize(raw: unknown, maxLen: number, minVal: number): number {
  let win = Math.round(parseFloat(String(raw)));
  if (!Number.isFinite(win)) win = minVal || 3;
  if (win < (minVal || 3)) win = minVal || 3;
  if (win % 2 === 0) win = win + 1;
  if (Number.isFinite(maxLen) && maxLen > 0 && win > maxLen) {
    win = maxLen;
    if (win % 2 === 0) win = Math.max(minVal || 1, win - 1);
  }
  return Math.max(minVal || 1, win);
}

function medianOfNumbers(vals: readonly number[]): number | null {
  if (!vals.length) return null;
  const sorted = vals.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function solveLinearSystem(mat: number[][], vec: number[]): number[] | null {
  const n = mat.length;
  const a = mat.map((row, i) => [...row, vec[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = a[col]!;
      a[col] = a[pivot]!;
      a[pivot] = tmp;
    }
    const d = a[col]![col]!;
    for (let j = col; j <= n; j++) a[col]![j] = a[col]![j]! / d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r]![col]!;
      if (!factor) continue;
      for (let c = col; c <= n; c++) a[r]![c] = a[r]![c]! - factor * a[col]![c]!;
    }
  }
  return a.map((row) => row[n]!);
}

function savitzkyGolayValue(
  data: readonly DataPoint[],
  idx: number,
  windowSize: number,
  order: number,
): number | null {
  const half = Math.floor(windowSize / 2);
  const lo = Math.max(0, idx - half);
  const hi = Math.min(data.length - 1, idx + half);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const d = data[i]!;
    if (Number.isFinite(d.amp)) {
      xs.push(i - idx);
      ys.push(d.amp);
    }
  }
  const deg = Math.min(order, xs.length - 1);
  if (xs.length === 0) return null;
  if (deg <= 0) return ys.reduce((a, b) => a + b, 0) / ys.length;

  const size = deg + 1;
  const mat: number[][] = [];
  const vec: number[] = [];
  for (let r = 0; r < size; r++) {
    mat[r] = [];
    for (let c = 0; c < size; c++) {
      let sum = 0;
      for (let k = 0; k < xs.length; k++) sum += Math.pow(xs[k]!, r + c);
      mat[r]![c] = sum;
    }
    let rhs = 0;
    for (let m = 0; m < xs.length; m++) rhs += ys[m]! * Math.pow(xs[m]!, r);
    vec[r] = rhs;
  }
  const coeff = solveLinearSystem(mat, vec);
  return coeff && Number.isFinite(coeff[0]) ? coeff[0]! : ys.reduce((a, b) => a + b, 0) / ys.length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Smooth trace data using the specified method. */
export function smoothTraceData(
  data: readonly DataPoint[],
  method: SmoothingMethod,
  windowSize: unknown,
  polyOrder?: unknown,
): SmoothResult {
  const src = Array.isArray(data) ? data : [];
  if (!src.length) return { data: [], window: Number(windowSize) || 3, polyOrder: null };
  const mode = method ?? "moving-average";

  if (mode === "none") {
    return { data: src.map((p) => ({ freq: p.freq, amp: p.amp })), window: 1, polyOrder: null };
  }

  let win = normalizeOddWindowSize(windowSize, src.length, 3);
  if (win > src.length && src.length > 0) win = normalizeOddWindowSize(src.length, src.length, 1);
  if (win < 3) {
    return { data: src.map((p) => ({ freq: p.freq, amp: p.amp })), window: win, polyOrder: Number(polyOrder) || null };
  }

  const half = Math.floor(win / 2);

  if (mode === "moving-average") {
    return {
      data: src.map((p, idx) => {
        const lo = Math.max(0, idx - half);
        const hi = Math.min(src.length - 1, idx + half);
        let sum = 0;
        let count = 0;
        for (let i = lo; i <= hi; i++) {
          if (Number.isFinite(src[i]!.amp)) { sum += src[i]!.amp; count++; }
        }
        return { freq: p.freq, amp: count ? sum / count : p.amp };
      }),
      window: win,
      polyOrder: null,
    };
  }

  if (mode === "median-filter") {
    return {
      data: src.map((p, idx) => {
        const lo = Math.max(0, idx - half);
        const hi = Math.min(src.length - 1, idx + half);
        const vals: number[] = [];
        for (let i = lo; i <= hi; i++) {
          if (Number.isFinite(src[i]!.amp)) vals.push(src[i]!.amp);
        }
        const med = medianOfNumbers(vals);
        return { freq: p.freq, amp: Number.isFinite(med) && med !== null ? med : p.amp };
      }),
      window: win,
      polyOrder: null,
    };
  }

  if (mode === "savitzky-golay") {
    let ord = Math.round(parseFloat(String(polyOrder)));
    if (!Number.isFinite(ord)) ord = 2;
    ord = Math.max(1, Math.min(ord, win - 1));
    return {
      data: src.map((p, idx) => {
        const y = savitzkyGolayValue(src, idx, win, ord);
        return { freq: p.freq, amp: Number.isFinite(y) && y !== null ? y : p.amp };
      }),
      window: win,
      polyOrder: ord,
    };
  }

  return { data: src.map((p) => ({ freq: p.freq, amp: p.amp })), window: win, polyOrder: Number(polyOrder) || null };
}

/** Apply a binary math operation to two amplitude values. */
export function applyBinaryTraceMathOp(
  aAmp: number,
  bAmp: number,
  op: BinaryOp,
): number | null {
  if (!Number.isFinite(aAmp) || !Number.isFinite(bAmp)) return null;
  if (op === "add") return aAmp + bAmp;
  if (op === "subtract") return aAmp - bAmp;
  if (op === "multiply") return aAmp * bAmp;
  if (op === "divide") {
    if (bAmp === 0) return null;
    return aAmp / bAmp;
  }
  return null;
}

/** Compute binary trace math (A op B) with interpolation. */
export function computeBinaryTraceMathData(
  aData: readonly DataPoint[],
  bData: readonly DataPoint[],
  requestedInterpolation: InterpolationMethod,
  operation: BinaryOp,
): BinaryTraceMathResult {
  const window = getOverlapWindow(aData, bData);
  if (!window) return { error: "No overlap between the selected traces." };

  const aOverlap = getDataInWindow(aData, window);
  const bOverlap = getDataInWindow(bData, window);
  if (!aOverlap.length || !bOverlap.length) return { error: "No overlap between the selected traces." };

  let effectiveInterpolation = requestedInterpolation;
  const exactAligned = overlapArraysMatchExactly(aOverlap, bOverlap);

  if (requestedInterpolation === "auto") {
    effectiveInterpolation = exactAligned ? "exact" : "linear";
  }
  if (requestedInterpolation === "exact" && !exactAligned) {
    return { error: "Exact only requires matching X samples over the overlap range." };
  }

  let dropped = 0;
  const data = aOverlap.flatMap((p) => {
    const bAmp = effectiveInterpolation === "exact"
      ? ampsFromExactMatch(bOverlap, p.freq)
      : interpolateAmpAtFreq(bData, p.freq, effectiveInterpolation);
    if (bAmp === null) { dropped++; return []; }
    const amp = applyBinaryTraceMathOp(p.amp, bAmp, operation);
    if (!Number.isFinite(amp) || amp === null) { dropped++; return []; }
    return [{ freq: p.freq, amp }];
  });

  if (!data.length) {
    return {
      error: operation === "divide"
        ? "A / B produced no valid points over the overlap range."
        : "No valid points were produced over the overlap range.",
    };
  }

  return { data, appliedInterpolation: effectiveInterpolation, droppedPoints: dropped };
}
