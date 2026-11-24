// ============================================================================
// Mergen Scope — Binary Waveform Reduction Modes
// ============================================================================
// Pure domain module (no React, no DOM). Implements streaming full decode,
// boxcar N->1 averaging (preserving uniform spacing), and min-max display
// envelope reduction directly from an index accessor without allocating full
// intermediate DataPoint arrays.
// ============================================================================

import type { DataPoint } from "../../types/trace.ts";
import { isUniformDataPoints } from "../interpolation.ts";
import { pointBudget, recommendedDecimateFactor } from "../point-budget.ts";

export type BinaryReduction =
  | { readonly mode: "full" }
  | { readonly mode: "decimate"; readonly factor: number }
  | { readonly mode: "envelope"; readonly targetPoints: number };

export interface BinarySampleSlice {
  readonly start: number;
  readonly count: number;
}

export interface BinaryParseOptions {
  readonly slice?: BinarySampleSlice;
  readonly reduction?: BinaryReduction;
}

export type ScopeProbeResult =
  | { readonly ok: true; readonly totalPoints: number }
  | { readonly ok: false; readonly error: string };

export interface ReduceBinarySeriesInput {
  /** Number of raw samples in the selected slice. */
  readonly count: number;
  /** X coordinate of sample index 0 in the slice. */
  readonly xStart: number;
  /** Sample interval along X. */
  readonly dt: number;
  /** Read calibrated Y value at slice-relative index 0 <= i < count. */
  readonly readY: (index: number) => number;
  /** Sample validity check (defaults to Number.isFinite). */
  readonly isUsable?: (value: number) => boolean;
  /** Reduction mode (defaults to { mode: "full" }). */
  readonly reduction?: BinaryReduction;
}

export interface ReduceBinarySeriesResult {
  readonly points: DataPoint[];
  readonly isUniform: boolean;
  readonly envelopeOf?: number;
  readonly decimationNote: string | null;
}

const DEFAULT_ENVELOPE_TARGET = 16_000;

/** Choose the default reduction mode for a total sample point count. */
export function defaultBinaryReduction(totalPoints: number): BinaryReduction {
  const { level } = pointBudget(totalPoints);
  if (level === "ok" || level === "large") {
    return { mode: "full" };
  }
  return { mode: "decimate", factor: recommendedDecimateFactor(totalPoints) };
}

/** Stream samples from `readY` and apply full, boxcar decimate, or min-max envelope reduction. */
export function reduceBinarySeries(input: ReduceBinarySeriesInput): ReduceBinarySeriesResult {
  const count = Number.isFinite(input.count) && input.count > 0 ? Math.floor(input.count) : 0;
  if (count === 0 || !Number.isFinite(input.xStart) || !Number.isFinite(input.dt) || input.dt === 0) {
    return { points: [], isUniform: false, decimationNote: null };
  }

  const isUsable = input.isUsable ?? Number.isFinite;
  const reduction = input.reduction ?? { mode: "full" };

  if (reduction.mode === "decimate") {
    const factor = Number.isFinite(reduction.factor) ? Math.max(1, Math.floor(reduction.factor)) : 1;
    if (factor >= 2) {
      const blocks = Math.ceil(count / factor);
      const blockDt = input.dt * factor;
      const points: DataPoint[] = [];
      let skippedBlocks = 0;

      for (let b = 0; b < blocks; b++) {
        const s = b * factor;
        const e = Math.min(count, s + factor);
        let sum = 0;
        let usable = 0;
        for (let i = s; i < e; i++) {
          const y = input.readY(i);
          if (isUsable(y)) {
            sum += y;
            usable += 1;
          }
        }
        if (usable === 0) {
          skippedBlocks += 1;
          continue;
        }
        const x = input.xStart + b * blockDt;
        const avg = sum / usable;
        if (Number.isFinite(x) && Number.isFinite(avg)) {
          points.push({ freq: x, amp: avg });
        } else {
          skippedBlocks += 1;
        }
      }

      return {
        points,
        isUniform: skippedBlocks === 0 && input.dt > 0,
        decimationNote: `Boxcar decimated ${factor}\u00d7 (${count.toLocaleString("en-US")} \u2192 ${points.length.toLocaleString("en-US")} pts)`,
      };
    }
  }

  if (reduction.mode === "envelope") {
    const targetPoints = Number.isFinite(reduction.targetPoints) && reduction.targetPoints >= 2
      ? Math.floor(reduction.targetPoints)
      : DEFAULT_ENVELOPE_TARGET;
    if (count > targetPoints) {
      const buckets = Math.max(1, Math.floor(targetPoints / 2));
      const points: DataPoint[] = [];

      for (let b = 0; b < buckets; b++) {
        const s = Math.floor((b * count) / buckets);
        const e = Math.max(s + 1, Math.floor(((b + 1) * count) / buckets));
        let minIdx = -1;
        let maxIdx = -1;
        let minVal = Number.POSITIVE_INFINITY;
        let maxVal = Number.NEGATIVE_INFINITY;

        for (let i = s; i < e; i++) {
          const y = input.readY(i);
          if (!isUsable(y)) continue;
          if (y < minVal) { minVal = y; minIdx = i; }
          if (y > maxVal) { maxVal = y; maxIdx = i; }
        }
        if (minIdx < 0 || maxIdx < 0) continue;

        const pushPoint = (idx: number, val: number) => {
          const x = input.xStart + idx * input.dt;
          if (Number.isFinite(x) && Number.isFinite(val)) {
            points.push({ freq: x, amp: val });
          }
        };

        if (minIdx === maxIdx) {
          pushPoint(minIdx, minVal);
        } else if (minIdx < maxIdx) {
          pushPoint(minIdx, minVal);
          pushPoint(maxIdx, maxVal);
        } else {
          pushPoint(maxIdx, maxVal);
          pushPoint(minIdx, minVal);
        }
      }

      return {
        points,
        isUniform: false,
        envelopeOf: count,
        decimationNote: `Min-max reduced from ${count.toLocaleString("en-US")} to ${points.length.toLocaleString("en-US")} pts`,
      };
    }
  }

  const points: DataPoint[] = [];
  let skipped = 0;
  for (let i = 0; i < count; i++) {
    const y = input.readY(i);
    if (!isUsable(y)) {
      skipped += 1;
      continue;
    }
    const x = input.xStart + i * input.dt;
    if (Number.isFinite(x)) {
      points.push({ freq: x, amp: y });
    } else {
      skipped += 1;
    }
  }
  return {
    points,
    isUniform: skipped === 0 && input.dt > 0,
    decimationNote: null,
  };
}

/** Boxcar-average an existing DataPoint array by integer `factor`. */
export function boxcarDecimatePoints(points: readonly DataPoint[], factor: number): ReduceBinarySeriesResult {
  if (!points.length) return { points: [], isUniform: false, decimationNote: null };
  const first = points[0];
  const last = points[points.length - 1];
  const xStart = first?.freq ?? 0;
  const dt = points.length >= 2 && first && last && last.freq !== first.freq
    ? (last.freq - first.freq) / (points.length - 1)
    : 1;
  return reduceBinarySeries({
    count: points.length,
    xStart,
    dt,
    readY: (i) => points[i]?.amp ?? Number.NaN,
    reduction: { mode: "decimate", factor },
  });
}

/** Min-max envelope reduction over an existing DataPoint array. */
export function envelopeMinMaxPoints(points: readonly DataPoint[], targetPoints: number): ReduceBinarySeriesResult {
  if (!points.length) return { points: [], isUniform: false, decimationNote: null };
  const safeTarget = Number.isFinite(targetPoints) && targetPoints >= 2 ? Math.floor(targetPoints) : DEFAULT_ENVELOPE_TARGET;
  if (points.length <= safeTarget) {
    return {
      points: points.slice(),
      isUniform: isUniformDataPoints(points),
      decimationNote: null,
    };
  }

  const buckets = Math.max(1, Math.floor(safeTarget / 2));
  const out: DataPoint[] = [];
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor((b * points.length) / buckets);
    const e = Math.max(s + 1, Math.floor(((b + 1) * points.length) / buckets));
    let minIdx = -1;
    let maxIdx = -1;
    let minVal = Number.POSITIVE_INFINITY;
    let maxVal = Number.NEGATIVE_INFINITY;
    for (let i = s; i < e; i++) {
      const pt = points[i];
      if (!pt || !Number.isFinite(pt.freq) || !Number.isFinite(pt.amp)) continue;
      if (pt.amp < minVal) { minVal = pt.amp; minIdx = i; }
      if (pt.amp > maxVal) { maxVal = pt.amp; maxIdx = i; }
    }
    if (minIdx < 0 || maxIdx < 0) continue;
    const minPt = points[minIdx];
    const maxPt = points[maxIdx];
    if (!minPt || !maxPt) continue;
    if (minIdx === maxIdx) {
      out.push({ freq: minPt.freq, amp: minPt.amp });
    } else if (minIdx < maxIdx) {
      out.push({ freq: minPt.freq, amp: minPt.amp });
      out.push({ freq: maxPt.freq, amp: maxPt.amp });
    } else {
      out.push({ freq: maxPt.freq, amp: maxPt.amp });
      out.push({ freq: minPt.freq, amp: minPt.amp });
    }
  }
  return {
    points: out,
    isUniform: false,
    envelopeOf: points.length,
    decimationNote: `Min-max reduced from ${points.length.toLocaleString("en-US")} to ${out.length.toLocaleString("en-US")} pts`,
  };
}
