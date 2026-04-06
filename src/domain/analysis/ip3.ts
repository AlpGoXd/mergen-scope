// ============================================================================
// Mergen Scope — IP3 / TOI Analysis
// ============================================================================
// Ported from: app-modules/analysis-helpers.js (calcIP3, buildIP3RoleRefs)
// ============================================================================

import type { Trace } from "../../types/trace.ts";
import type { IP3Points, Marker } from "../../types/marker.ts";
import { getTraceId } from "../trace-model.ts";

export const IP3_ROLE_KEYS = ["f1", "f2", "im3l", "im3u"] as const;
export const IP3_ROLE_LABELS: Record<string, string> = { f1: "F1", f2: "F2", im3l: "IM3L", im3u: "IM3U" };

/** Check if a label is one of the IP3 role labels. */
export function isIP3Label(label: string | null | undefined): boolean {
  return ["F1", "F2", "IM3L", "IM3U"].includes(label ?? "");
}

/** Clone a marker but remove its IP3 role label if it has one. */
export function cloneMarkerWithoutIP3Label(marker: Marker | null): Marker | null {
  if (!marker) return marker;
  if (!isIP3Label(marker.label)) return marker;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { label, ...next } = marker;
  return next as Marker;
}

/** Extract IP3 points from a set of markers based on their labels. */
export function getIP3PointsFromMarkers(markers: Marker[]): IP3Points {
  const pts: any = { f1: null, f2: null, im3l: null, im3u: null };
  Object.keys(IP3_ROLE_LABELS).forEach((key) => {
    const label = IP3_ROLE_LABELS[key];
    const marker = (markers || []).find((item) => item && item.label === label);
    if (marker) {
      pts[key] = {
        freq: marker.freq,
        amp: marker.amp,
        trace: marker.trace,
        label: marker.label
      };
    }
  });
  return pts as IP3Points;
}

// ---------------------------------------------------------------------------
// IP3 result
// ---------------------------------------------------------------------------

/** Full IP3/TOI calculation result. */
export interface IP3Result {
  readonly f1: number;
  readonly f2: number;
  readonly p1: number;
  readonly p2: number;
  readonly pim3l: number;
  readonly pim3u: number;
  readonly fim3l: number;
  readonly fim3u: number;
  readonly oip3_l: number;
  readonly oip3_u: number;
  readonly oip3_avg: number;
  readonly deltaL: number;
  readonly deltaU: number;
}

// ---------------------------------------------------------------------------
// IP3 computation
// ---------------------------------------------------------------------------

/** Compute IP3 from raw fundamental and IM3 power values. */
export function calcIP3(
  f1: number, p1: number,
  f2: number, p2: number,
  pil: number, piu: number,
): IP3Result {
  const ol = p1 + (p1 - pil) / 2;
  const ou = p2 + (p2 - piu) / 2;
  return {
    f1, f2, p1, p2,
    pim3l: pil, pim3u: piu,
    fim3l: 2 * f1 - f2, fim3u: 2 * f2 - f1,
    oip3_l: ol, oip3_u: ou,
    oip3_avg: (ol + ou) / 2,
    deltaL: p1 - pil, deltaU: p2 - piu,
  };
}

/** Compute IP3 from marker IP3 points. Returns null if any point is missing. */
export function calcIP3FromPoints(points: IP3Points): IP3Result | null {
  if (!points.f1 || !points.f2 || !points.im3l || !points.im3u) return null;
  const low = points.f1.freq <= points.f2.freq ? points.f1 : points.f2;
  const high = points.f1.freq <= points.f2.freq ? points.f2 : points.f1;
  return calcIP3(low.freq, low.amp, high.freq, high.amp, points.im3l.amp, points.im3u.amp);
}

// ---------------------------------------------------------------------------
// IP3 role references
// ---------------------------------------------------------------------------

/** IP3 role reference map. */
export interface IP3RoleRefs {
  readonly [key: string]: string | null;
}

/**
 * Build IP3 role reference map from marker points.
 * Used when saving IP3 results to link back to source traces.
 */
export function buildIP3RoleRefs(
  ip3Pts: IP3Points,
  resolveTraceByName: (name: string) => Trace | null,
): IP3RoleRefs {
  const roleKeys = ["f1", "f2", "im3l", "im3u"] as const;
  const roles: Record<string, string | null> = {};

  for (const key of roleKeys) {
    const pt = ip3Pts[key];
    const traceName = pt?.trace ?? null;
    const trace = traceName ? resolveTraceByName(traceName) : null;
    roles[`${key}TraceId`] = trace ? getTraceId(trace) : null;
    roles[`${key}TraceName`] = traceName;
  }

  return roles;
}

/** 
 * Create a serializable saved IP3 result.
 * Ported from analysis-helpers.js.
 */
export function makeSavedIP3Result(
  ip3Res: IP3Result | null,
  ip3Pts: IP3Points | null,
  ip3Gain: string,
  traceInfo?: { 
    traceLabel?: string; 
    sourceTraceId?: string | null; 
    sourceTraceName?: string | null;
    roles?: Record<string, string | null>;
  }
): any {
  if (!ip3Res || !ip3Pts) return null;
  const info = traceInfo || {};
  const gain = (ip3Gain !== '' && !isNaN(parseFloat(ip3Gain))) ? parseFloat(ip3Gain) : null;

  return {
    id: Date.now() + Math.random(),
    functionType: "ip3",
    traceLabel: info.traceLabel || ip3Pts.f1?.trace || ip3Pts.f2?.trace || "-",
    sourceTraceId: info.sourceTraceId || null,
    sourceTraceName: info.sourceTraceName || ip3Pts.f1?.trace || ip3Pts.f2?.trace || ip3Pts.im3l?.trace || ip3Pts.im3u?.trace || null,
    parameters: {
      gain,
      roles: {
        f1Trace: ip3Pts.f1?.trace,
        f2Trace: ip3Pts.f2?.trace,
        im3lTrace: ip3Pts.im3l?.trace,
        im3uTrace: ip3Pts.im3u?.trace,
        ...(info.roles || {})
      }
    },
    values: {
      oip3_l: ip3Res.oip3_l,
      oip3_u: ip3Res.oip3_u,
      oip3_avg: ip3Res.oip3_avg,
      deltaL: ip3Res.deltaL,
      deltaU: ip3Res.deltaU,
      f1: ip3Res.f1,
      f2: ip3Res.f2,
      fim3l: ip3Res.fim3l,
      fim3u: ip3Res.fim3u
    }
  };
}
