// ============================================================================
// Mergen Scope — Range Statistics & Peak/Spur Table
// ============================================================================
// Ported from: app-modules/range-analysis-helpers.js
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

function medianOf(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const center = sorted[mid];
  if (center === undefined) return null;
  if (sorted.length % 2) return center;
  const left = sorted[mid - 1];
  return left === undefined ? null : (left + center) / 2;
}

// ---------------------------------------------------------------------------
// Range statistics
// ---------------------------------------------------------------------------

/** Result of computing range statistics over trace data. */
export interface RangeStats {
  readonly count: number;
  readonly min: DataPoint;
  readonly max: DataPoint;
  readonly average: number;
  readonly median: number | null;
  readonly spanHz: number;
}

/** Compute range statistics (min, max, avg, median) over data points. */
export function computeRangeStats(
  data: readonly DataPoint[],
): RangeStats | null {
  const points = finiteData(data);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;

  const amps = points.map((p) => p.amp);
  const sum = amps.reduce((acc, v) => acc + v, 0);

  const minPoint = points.reduce((best, p) => p.amp < best.amp ? p : best, first);
  const maxPoint = points.reduce((best, p) => p.amp > best.amp ? p : best, first);

  return {
    count: points.length,
    min: minPoint,
    max: maxPoint,
    average: sum / points.length,
    median: medianOf(amps),
    spanHz: points.length > 1 ? last.freq - first.freq : 0,
  };
}

// ---------------------------------------------------------------------------
// Peak/spur table
// ---------------------------------------------------------------------------

/** Options for building a peak/spur table. */
export interface PeakTableOptions {
  readonly limit?: number;
  readonly minSpacingHz?: number;
  readonly minAmp?: number | null;
}

/** A single row in the peak/spur table. */
export interface PeakTableRow {
  readonly rank: number;
  readonly freq: number;
  readonly amp: number;
}

/** Build a table of the highest peaks in the data. */
export function buildPeakSpurTable(
  data: readonly DataPoint[],
  options?: PeakTableOptions,
): PeakTableRow[] {
  const points = finiteData(data);
  const first = points[0];
  if (!first) return [];

  const opts = options ?? {};
  const limit = Math.max(1, Math.min(50, Math.round(Number(opts.limit) || 10)));
  const minSpacingHz = Math.max(0, Number(opts.minSpacingHz) || 0);
  const minAmp = opts.minAmp === null || opts.minAmp === undefined ? null : Number(opts.minAmp);

  let peaks: DataPoint[] = [];

  if (points.length < 3) {
    peaks = points.slice();
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const next = points[i + 1];
      if (!prev || !cur || !next) continue;
      if (cur.amp >= prev.amp && cur.amp >= next.amp && (cur.amp > prev.amp || cur.amp > next.amp)) {
        peaks.push(cur);
      }
    }
  }

  if (!peaks.length) {
    const best = points.reduce((b, p) => p.amp > b.amp ? p : b, first);
    peaks = [best];
  }

  peaks = peaks
    .filter((p) => minAmp === null || !Number.isFinite(minAmp) || p.amp >= minAmp)
    .sort((a, b) => b.amp - a.amp);

  const out: PeakTableRow[] = [];
  for (const point of peaks) {
    if (out.length >= limit) break;
    if (minSpacingHz > 0 && out.some((row) => Math.abs(row.freq - point.freq) < minSpacingHz)) continue;
    out.push({ rank: out.length + 1, freq: point.freq, amp: point.amp });
  }

  return out;
}

/** Slice trace data to a frequency range. */
export function sliceTraceToRange(
  data: readonly DataPoint[],
  rangeHz: { left: number; right: number } | null | undefined,
): DataPoint[] {
  const finite = finiteData(data);
  if (!rangeHz || !Number.isFinite(rangeHz.left) || !Number.isFinite(rangeHz.right) || rangeHz.right < rangeHz.left) {
    return finite;
  }
  return finite.filter((p) => p.freq >= rangeHz.left && p.freq <= rangeHz.right);
}
