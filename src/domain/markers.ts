// ============================================================================
// Mergen Scope - Marker Functions
// ============================================================================
// Ported from: app-modules/marker-helpers.js shapes
// ============================================================================

import { getResolvedInterpolationStrategy, resolveValue } from "./interpolation.ts";
import type {
  Marker,
  MarkerPlacement,
  IP3Point,
  IP3Points,
  IP3RoleLabel,
  ExtremumKind,
} from "../types/marker.ts";
import type { DataPoint, Trace } from "../types/trace.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** IP3 role keys in canonical order. */
export const IP3_ROLE_KEYS = ["f1", "f2", "im3l", "im3u"] as const;

/** IP3 role labels by key. */
export const IP3_ROLE_LABELS: Readonly<Record<string, IP3RoleLabel>> = {
  f1: "F1",
  f2: "F2",
  im3l: "IM3L",
  im3u: "IM3U",
};

// ---------------------------------------------------------------------------
// Nearest index (binary-style search)
// ---------------------------------------------------------------------------

/** Find the index of the data point nearest to the given frequency. */
export function nearestIndexByFreq(
  data: readonly DataPoint[],
  freq: number,
): number {
  if (!data.length || !Number.isFinite(freq)) return -1;
  let bestIdx = 0;
  let bestDf = Math.abs(data[0]!.freq - freq);
  for (let i = 1; i < data.length; i++) {
    const df = Math.abs(data[i]!.freq - freq);
    if (df < bestDf) {
      bestDf = df;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function hasExactSample(traceData: readonly DataPoint[], targetFreq: number): boolean {
  let lo = 0;
  let hi = traceData.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = traceData[mid]!.freq;
    if (value === targetFreq) return true;
    if (value < targetFreq) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

export interface MagneticSnapOptions {
  readonly nearestPointPixelDistance?: number;
  readonly snapThresholdPx?: number;
}

/** Resolve a marker location using the interpolation strategy associated with a trace. */
export function placeMarker(
  trace: Pick<Trace, "data" | "family" | "interpolation" | "isUniform">,
  targetFreq: number,
  magneticSnap?: MagneticSnapOptions,
): MarkerPlacement {
  const traceData = trace.data ?? [];
  if (!traceData.length || !Number.isFinite(targetFreq)) {
    return { requestedFreq: targetFreq, freq: targetFreq, amp: 0, interpolated: false };
  }

  const isUniform = trace.isUniform ?? false;
  const strategy = getResolvedInterpolationStrategy(trace.family, trace.interpolation, isUniform);
  const nearestIndex = nearestIndexByFreq(traceData, targetFreq);
  const nearestPoint = nearestIndex >= 0 ? traceData[nearestIndex]! : null;
  const shouldMagnetSnap = strategy === "snap"
    || (
      nearestPoint != null
      && Number.isFinite(magneticSnap?.nearestPointPixelDistance)
      && (magneticSnap?.nearestPointPixelDistance ?? Infinity) <= (magneticSnap?.snapThresholdPx ?? Infinity)
    );
  const requestedFreq = shouldMagnetSnap && nearestPoint ? nearestPoint.freq : targetFreq;
  const exactHit = hasExactSample(traceData, requestedFreq);
  const resolved = resolveValue(traceData, requestedFreq, strategy, isUniform);

  return {
    requestedFreq: targetFreq,
    freq: resolved.x,
    amp: resolved.y,
    interpolated: !exactHit && strategy !== "snap" && resolved.x === targetFreq,
  };
}

// ---------------------------------------------------------------------------
// IP3 helpers
// ---------------------------------------------------------------------------

/** Check if a label is an IP3 role label. */
export function isIP3Label(label: string | null | undefined): boolean {
  return ["F1", "F2", "IM3L", "IM3U"].includes(String(label ?? ""));
}

/** Clone a marker, removing its IP3 label if present. */
export function cloneMarkerWithoutIP3Label(marker: Marker | null): Marker | null {
  if (!marker) return marker;
  if (!isIP3Label(marker.label)) return marker;
  return { ...marker, label: null };
}

/** Extract IP3 role points from a marker array. */
export function getIP3PointsFromMarkers(
  markers: readonly Marker[],
): IP3Points {
  const pts: { f1: IP3Point | null; f2: IP3Point | null; im3l: IP3Point | null; im3u: IP3Point | null } = {
    f1: null,
    f2: null,
    im3l: null,
    im3u: null,
  };

  for (const [key, label] of Object.entries(IP3_ROLE_LABELS)) {
    const marker = markers.find((item) => item?.label === label);
    if (marker) {
      pts[key as keyof typeof pts] = {
        freq: marker.freq,
        amp: marker.amp,
        trace: marker.trace,
        label: marker.label ?? "",
      };
    }
  }

  return pts;
}

// ---------------------------------------------------------------------------
// Extrema detection
// ---------------------------------------------------------------------------

/** Build a list of local extrema (peaks or valleys) from trace data. */
export function buildExtrema(
  data: readonly DataPoint[],
  kind: ExtremumKind,
): DataPoint[] {
  const finite = data.filter(
    (point) => Number.isFinite(point.freq) && Number.isFinite(point.amp),
  );
  if (!finite.length) return [];

  const out: DataPoint[] = [];
  for (let i = 1; i < finite.length - 1; i++) {
    const prev = finite[i - 1]!;
    const cur = finite[i]!;
    const next = finite[i + 1]!;
    if (kind === "max") {
      if (cur.amp >= prev.amp && cur.amp >= next.amp && (cur.amp > prev.amp || cur.amp > next.amp)) {
        out.push(cur);
      }
    } else if (cur.amp <= prev.amp && cur.amp <= next.amp && (cur.amp < prev.amp || cur.amp < next.amp)) {
      out.push(cur);
    }
  }

  if (!out.length) {
    const fallback = finite.reduce((best, point) => {
      if (!best) return point;
      return kind === "max"
        ? (point.amp > best.amp ? point : best)
        : (point.amp < best.amp ? point : best);
    });
    if (fallback) out.push(fallback);
  }

  return out;
}

/** Find the global maximum point in trace data. */
export function findAbsoluteMax(data: readonly DataPoint[]): DataPoint | null {
  const finite = data.filter(p => Number.isFinite(p.freq) && Number.isFinite(p.amp));
  if (!finite.length) return null;
  return finite.reduce((best, p) => p.amp > best.amp ? p : best);
}

/** Find the global minimum point in trace data. */
export function findAbsoluteMin(data: readonly DataPoint[]): DataPoint | null {
  const finite = data.filter(p => Number.isFinite(p.freq) && Number.isFinite(p.amp));
  if (!finite.length) return null;
  return finite.reduce((best, p) => p.amp < best.amp ? p : best);
}

/**
 * Find the next local extremum from a given frequency in a direction.
 * fromFreq=null means start from the edge (leftmost if right, rightmost if left).
 */
export function findNextLocalExtremum(
  data: readonly DataPoint[],
  fromFreq: number | null,
  direction: 'left' | 'right',
  kind: ExtremumKind,
): DataPoint | null {
  const extrema = buildExtrema(data, kind); // left-to-right order
  if (!extrema.length) return null;
  if (fromFreq === null) {
    return direction === 'right' ? extrema[0]! : extrema[extrema.length - 1]!;
  }
  if (direction === 'right') {
    return extrema.find(p => p.freq > fromFreq) ?? null;
  } else {
    const before = extrema.filter(p => p.freq < fromFreq);
    return before.length ? before[before.length - 1]! : null;
  }
}

/** Check if a data point at the given index is a local extremum. */
export function isLocalExtremum(
  data: readonly DataPoint[],
  idx: number,
  kind: ExtremumKind,
): boolean {
  if (!data || idx <= 0 || idx >= data.length - 1) return false;
  const prev = data[idx - 1];
  const cur = data[idx];
  const next = data[idx + 1];
  if (!prev || !cur || !next) return false;
  if (kind === "max") {
    return cur.amp >= prev.amp && cur.amp >= next.amp && (cur.amp > prev.amp || cur.amp > next.amp);
  }
  return cur.amp <= prev.amp && cur.amp <= next.amp && (cur.amp < prev.amp || cur.amp < next.amp);
}

// ---------------------------------------------------------------------------
// Peak search helpers
// ---------------------------------------------------------------------------

/** Find the highest peak excluding certain frequencies. */
export function findHighestPeakExcluding(
  data: readonly DataPoint[],
  excludeFreqs: readonly number[],
  exHz: number,
): DataPoint | null {
  let best: DataPoint | null = null;
  for (const point of data) {
    if (!Number.isFinite(point.freq) || !Number.isFinite(point.amp)) continue;
    if (excludeFreqs.some((freq) => Math.abs(point.freq - freq) < exHz)) continue;
    if (!best || point.amp > best.amp) best = point;
  }
  return best;
}

/** Find the highest peak near a target frequency within a window. */
export function findPeakNearFreq(
  data: readonly DataPoint[],
  targetHz: number,
  windowHz: number,
): DataPoint | null {
  let best: DataPoint | null = null;
  let near: DataPoint | null = null;
  let nearDf = Infinity;

  for (const point of data) {
    if (!Number.isFinite(point.freq) || !Number.isFinite(point.amp)) continue;
    const df = Math.abs(point.freq - targetHz);
    if (df < nearDf) {
      nearDf = df;
      near = point;
    }
    if (df <= windowHz && (!best || point.amp > best.amp)) best = point;
  }

  return best ?? near;
}
