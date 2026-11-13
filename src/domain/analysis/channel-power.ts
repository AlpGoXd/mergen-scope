// ============================================================================
// Mergen Scope — Channel Power & Occupied Bandwidth
// ============================================================================
// Ported from: app-modules/range-analysis-helpers.js
// ============================================================================

import type { DataPoint } from "../../types/trace.ts";
import { normalizeUnitName } from "../units.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function finiteData(data: readonly DataPoint[]): DataPoint[] {
  return data.filter(
    (p) => p && Number.isFinite(p.freq) && Number.isFinite(p.amp),
  );
}

function logPowerToMilliwatts(amp: number, unit: string): number | null {
  const norm = normalizeUnitName(unit);
  if (norm === "dbm") return Math.pow(10, amp / 10);
  if (norm === "dbw") return Math.pow(10, (amp + 30) / 10);
  return null;
}

function spectralDensityToMilliwattsPerHz(amp: number, unit: string): number | null {
  const norm = normalizeUnitName(unit);
  if (norm === "dbm/hz" || norm === "dbmperhz") return Math.pow(10, amp / 10);
  if (norm === "dbw/hz" || norm === "dbwperhz") return Math.pow(10, (amp + 30) / 10);
  return null;
}

interface IntegrationSegment {
  readonly left: number;
  readonly right: number;
  readonly area: number;
}

interface IntegrationResult {
  readonly total: number;
  readonly segs: readonly IntegrationSegment[];
}

function integrateLinearArea(
  data: readonly DataPoint[],
  linearValueFn: (amp: number) => number | null,
): IntegrationResult | null {
  const points = finiteData(data);
  if (points.length < 2) return null;

  let total = 0;
  const segs: IntegrationSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const pa = linearValueFn(a.amp);
    const pb = linearValueFn(b.amp);
    if (!Number.isFinite(pa) || pa === null || !Number.isFinite(pb) || pb === null) continue;
    const width = b.freq - a.freq;
    if (!Number.isFinite(width) || width <= 0) continue;
    const area = ((pa + pb) / 2) * width;
    if (!Number.isFinite(area) || area < 0) continue;
    total += area;
    segs.push({ left: a.freq, right: b.freq, area });
  }

  return total > 0 ? { total, segs } : null;
}

function interpolateFreqForAreaTarget(
  segs: readonly IntegrationSegment[],
  target: number,
): number | null {
  if (!segs.length || !Number.isFinite(target)) return null;
  let acc = 0;
  for (const seg of segs) {
    if (acc + seg.area >= target) {
      const frac = seg.area > 0 ? Math.max(0, Math.min(1, (target - acc) / seg.area)) : 0;
      return seg.left + (seg.right - seg.left) * frac;
    }
    acc += seg.area;
  }
  return segs[segs.length - 1]!.right;
}

// ---------------------------------------------------------------------------
// Occupied bandwidth
// ---------------------------------------------------------------------------

/** Result of occupied bandwidth computation. */
export interface OccupiedBandwidthResult {
  readonly supported: boolean;
  readonly reason?: string;
  readonly percent?: number;
  readonly lower?: number;
  readonly upper?: number;
  readonly bandwidth?: number;
  readonly note?: string;
}

/** Compute occupied bandwidth (e.g. 99% power containment). */
export function computeOccupiedBandwidth(
  data: readonly DataPoint[],
  percent: number,
  yUnit: string,
): OccupiedBandwidthResult {
  const norm = normalizeUnitName(yUnit);
  if (!(norm === "dbm" || norm === "dbw")) {
    return { supported: false, reason: "Occupied bandwidth currently requires a power-like trace in dBm or dBW." };
  }

  let pct = Number(percent);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) pct = 99;

  const integrated = integrateLinearArea(data, (amp) => logPowerToMilliwatts(amp, yUnit));
  if (!integrated) {
    return { supported: false, reason: "Not enough visible samples to estimate occupied bandwidth." };
  }

  const total = integrated.total;
  const lowerTarget = total * ((1 - pct / 100) / 2);
  const upperTarget = total * ((1 + pct / 100) / 2);
  const lower = interpolateFreqForAreaTarget(integrated.segs, lowerTarget);
  const upper = interpolateFreqForAreaTarget(integrated.segs, upperTarget);

  if (!Number.isFinite(lower) || lower === null || !Number.isFinite(upper) || upper === null || upper <= lower) {
    return { supported: false, reason: "Could not resolve occupied bandwidth edges from the visible trace samples." };
  }

  return {
    supported: true,
    percent: pct,
    lower, upper,
    bandwidth: upper - lower,
    note: "Estimated from sampled visible-trace power after converting dBm/dBW samples to linear power.",
  };
}

// ---------------------------------------------------------------------------
// Channel power
// ---------------------------------------------------------------------------

/** Result of channel power computation. */
export interface ChannelPowerResult {
  readonly supported: boolean;
  readonly reason?: string;
  readonly powerDbm?: number;
  readonly powerDbw?: number;
  readonly note?: string;
}

/** Compute total channel power from spectral density data. */
export function computeChannelPower(
  data: readonly DataPoint[],
  yUnit: string,
): ChannelPowerResult {
  const norm = normalizeUnitName(yUnit);
  if (!(norm === "dbm/hz" || norm === "dbmperhz" || norm === "dbw/hz" || norm === "dbwperhz")) {
    return { supported: false, reason: "Channel power is deferred unless the trace unit is explicit spectral power density such as dBm/Hz or dBW/Hz." };
  }

  const integrated = integrateLinearArea(data, (amp) => spectralDensityToMilliwattsPerHz(amp, yUnit));
  if (!integrated) {
    return { supported: false, reason: "Not enough visible samples to integrate channel power." };
  }

  const mW = integrated.total;
  if (!Number.isFinite(mW) || mW <= 0) {
    return { supported: false, reason: "Integrated channel power is not finite in the visible range." };
  }

  return {
    supported: true,
    powerDbm: 10 * Math.log10(mW),
    powerDbw: 10 * Math.log10(mW / 1000),
    note: "Integrated from spectral-density samples over the visible range using trapezoidal integration.",
  };
}
