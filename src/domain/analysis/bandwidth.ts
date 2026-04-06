// ============================================================================
// Mergen Scope — Bandwidth Analysis
// ============================================================================
// Ported from: app-modules/range-analysis-helpers.js (computeBandwidthAtDrop)
// ============================================================================

import type { DataPoint } from "../../types/trace.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function finiteData(data: readonly DataPoint[]): DataPoint[] {
  return data.filter(
    (p) => p && Number.isFinite(p.freq) && Number.isFinite(p.amp),
  );
}

function nearestIndexByFreq(data: readonly DataPoint[], freq: number): number {
  if (!data.length || !Number.isFinite(freq)) return -1;
  let bestIdx = 0;
  let bestDelta = Math.abs(data[0]!.freq - freq);
  for (let i = 1; i < data.length; i++) {
    const delta = Math.abs(data[i]!.freq - freq);
    if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
  }
  return bestIdx;
}

function interpolateFreqAtLevel(
  a: DataPoint, b: DataPoint, level: number,
): number | null {
  if (!Number.isFinite(a.freq) || !Number.isFinite(b.freq) ||
      !Number.isFinite(a.amp) || !Number.isFinite(b.amp) ||
      !Number.isFinite(level)) {
    return null;
  }
  if (a.amp === b.amp) return null;
  const t = (level - a.amp) / (b.amp - a.amp);
  if (!Number.isFinite(t)) return null;
  return a.freq + (b.freq - a.freq) * t;
}

// ---------------------------------------------------------------------------
// Bandwidth result
// ---------------------------------------------------------------------------

/** Result of a bandwidth computation. */
export interface BandwidthResult {
  readonly refFreq: number;
  readonly refAmp: number;
  readonly level: number;
  readonly left: number;
  readonly right: number;
  readonly bandwidth: number;
  readonly mode: string;
}

// ---------------------------------------------------------------------------
// Bandwidth computation
// ---------------------------------------------------------------------------

/** Compute bandwidth at a given dB drop from a reference point. */
export function computeBandwidth(
  data: readonly DataPoint[],
  refFreq: number,
  refAmp: number,
  dropDb: number,
): BandwidthResult | null {
  const points = finiteData(data);
  if (points.length < 2 || !Number.isFinite(refFreq) || !Number.isFinite(refAmp) || !Number.isFinite(dropDb)) {
    return null;
  }

  const level = refAmp - Math.abs(dropDb);
  const refIdx = nearestIndexByFreq(points, refFreq);
  if (refIdx < 0) return null;

  let left: number | null = null;
  let leftMode = "none";
  let right: number | null = null;
  let rightMode = "none";

  // Search left
  for (let i = refIdx; i > 0; i--) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.amp === level) { left = a.freq; leftMode = "sample"; break; }
    if (b.amp === level) { left = b.freq; leftMode = "sample"; break; }
    if ((a.amp - level) * (b.amp - level) < 0) {
      left = interpolateFreqAtLevel(a, b, level);
      leftMode = "linear";
      break;
    }
  }

  // Search right
  for (let j = refIdx; j < points.length - 1; j++) {
    const c = points[j]!;
    const d = points[j + 1]!;
    if (c.amp === level) { right = c.freq; rightMode = "sample"; break; }
    if (d.amp === level) { right = d.freq; rightMode = "sample"; break; }
    if ((c.amp - level) * (d.amp - level) < 0) {
      right = interpolateFreqAtLevel(c, d, level);
      rightMode = "linear";
      break;
    }
  }

  if (!Number.isFinite(left) || left === null || !Number.isFinite(right) || right === null || right <= left) {
    return null;
  }

  return {
    refFreq, refAmp, level,
    left, right,
    bandwidth: right - left,
    mode: leftMode === rightMode ? leftMode : `${leftMode}/${rightMode}`,
  };
}
