// ============================================================================
// Mergen Scope — Marker Functions
// ============================================================================
// Ported from: app-modules/marker-helpers.js (106 lines)
// NEW: placeMarker with interpolation + snap threshold.
// ============================================================================

import type { DataPoint } from "../types/trace.ts";
import type {
  Marker,
  MarkerPlacement,
  IP3Point,
  IP3Points,
  IP3RoleLabel,
  ExtremumKind,
} from "../types/marker.ts";
import { interpolatePointAtX } from "./trace-math.ts";

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
    if (df < bestDf) { bestDf = df; bestIdx = i; }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// NEW: placeMarker with interpolation + snap threshold
// ---------------------------------------------------------------------------

/**
 * Place a marker on trace data at the target frequency.
 *
 * Logic:
 * 1. Binary search → find nearest existing point
 * 2. Check snap threshold (0.5 × local spacing)
 * 3. If outside threshold, interpolate between bracketing points
 */
export function placeMarker(
  traceData: readonly DataPoint[],
  targetFreq: number,
): MarkerPlacement {
  if (!traceData.length || !Number.isFinite(targetFreq)) {
    return { freq: targetFreq, amp: 0, interpolated: false };
  }

  // Binary search for insertion point
  let lo = 0;
  let hi = traceData.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (traceData[mid]!.freq < targetFreq) lo = mid + 1;
    else hi = mid;
  }

  // Find nearest point among lo and neighbors
  let bestIdx = lo;
  let bestDist = Math.abs(traceData[lo]!.freq - targetFreq);

  if (lo > 0) {
    const d = Math.abs(traceData[lo - 1]!.freq - targetFreq);
    if (d < bestDist) { bestDist = d; bestIdx = lo - 1; }
  }
  if (lo + 1 < traceData.length) {
    const d = Math.abs(traceData[lo + 1]!.freq - targetFreq);
    if (d < bestDist) { bestDist = d; bestIdx = lo + 1; }
  }

  // Compute local spacing for snap threshold
  const prev = bestIdx > 0 ? traceData[bestIdx - 1] : null;
  const next = bestIdx + 1 < traceData.length ? traceData[bestIdx + 1] : null;
  const best = traceData[bestIdx]!;

  let localStep = Infinity;
  if (prev) localStep = Math.min(localStep, Math.abs(best.freq - prev.freq));
  if (next) localStep = Math.min(localStep, Math.abs(next.freq - best.freq));

  if (!Number.isFinite(localStep) || localStep <= 0) {
    // Fallback: average spacing
    if (traceData.length > 1) {
      const span = Math.abs(traceData[traceData.length - 1]!.freq - traceData[0]!.freq);
      localStep = span / (traceData.length - 1);
    }
  }

  // Snap threshold: 0.5 × local spacing
  const snapThreshold = Number.isFinite(localStep) && localStep > 0 ? localStep * 0.5 : Infinity;

  // If within snap threshold, snap to existing point
  if (bestDist <= snapThreshold) {
    return { freq: best.freq, amp: best.amp, interpolated: false };
  }

  // Otherwise, interpolate between bracketing points
  // Find bracketing pair
  let leftIdx = -1;
  let rightIdx = -1;
  for (let i = 0; i < traceData.length; i++) {
    if (traceData[i]!.freq <= targetFreq) leftIdx = i;
    if (traceData[i]!.freq >= targetFreq && rightIdx === -1) rightIdx = i;
  }

  if (leftIdx >= 0 && rightIdx >= 0 && leftIdx !== rightIdx) {
    const ip = interpolatePointAtX(traceData[leftIdx]!, traceData[rightIdx]!, targetFreq);
    if (ip) {
      return { freq: ip.freq, amp: ip.amp, interpolated: true };
    }
  }

  // Fallback: snap to nearest
  return { freq: best.freq, amp: best.amp, interpolated: false };
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
    f1: null, f2: null, im3l: null, im3u: null,
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
    (p) => Number.isFinite(p.freq) && Number.isFinite(p.amp),
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
    } else {
      if (cur.amp <= prev.amp && cur.amp <= next.amp && (cur.amp < prev.amp || cur.amp < next.amp)) {
        out.push(cur);
      }
    }
  }

  if (!out.length) {
    const fallback = finite.reduce((best, point) => {
      if (!best) return point;
      return kind === "max" ? (point.amp > best.amp ? point : best) : (point.amp < best.amp ? point : best);
    });
    if (fallback) out.push(fallback);
  }

  return out;
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
    if (df < nearDf) { nearDf = df; near = point; }
    if (df <= windowHz && (!best || point.amp > best.amp)) best = point;
  }

  return best ?? near;
}
