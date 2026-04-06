// ============================================================================
// Mergen Scope — Noise PSD Analysis
// ============================================================================
// Ported from: app-modules/analysis-helpers.js (noisePSD, ENBW)
// ============================================================================

import type { DataPoint } from "../../types/trace.ts";

// ---------------------------------------------------------------------------
// ENBW filter constants
// ---------------------------------------------------------------------------

/** Equivalent Noise Bandwidth correction factors. */
export interface ENBWEntry {
  readonly k: number;
  readonly label: string;
}

/** ENBW table for supported filter types. */
export const ENBW: Readonly<Record<string, ENBWEntry>> = {
  gaussian: { k: 1.128, label: "Gaussian" },
  flattop: { k: 1.0, label: "Flat-top" },
  fivepole: { k: 1.047, label: "5-pole Sync" },
};

// ---------------------------------------------------------------------------
// Noise PSD computation
// ---------------------------------------------------------------------------

/**
 * Compute noise power spectral density from trace data.
 * Subtracts the RBW-dependent correction factor from each amplitude.
 */
export function noisePSD(
  data: readonly DataPoint[],
  rbw: number,
  filterType: string,
): DataPoint[] {
  const entry = ENBW[filterType] ?? ENBW["gaussian"]!;
  const correction = 10 * Math.log10(entry.k * rbw);
  return data.map((d) => ({ freq: d.freq, amp: d.amp - correction }));
}

/** 
 * Create a serializable saved noise result from computation stats.
 * Ported from analysis-helpers.js.
 */
export function makeSavedNoiseResult(
  npsdStats: any, 
  noiseFilter: string, 
  trace: any
): any {
  if (!npsdStats || !trace) return null;
  const entry = ENBW[noiseFilter] ?? ENBW["gaussian"]!;
  return {
    id: Date.now() + Math.random(),
    functionType: "noise-psd",
    traceLabel: trace.dn || trace.name || "",
    sourceTraceId: trace.id || null,
    sourceTraceName: trace.name || null,
    parameters: {
      filter: noiseFilter,
      filterLabel: entry.label,
      rbw: npsdStats.rbw,
      enbw: entry.k * npsdStats.rbw,
      correction: 10 * Math.log10(entry.k * npsdStats.rbw)
    },
    values: {
      peak: npsdStats.peak?.amp ?? 0,
      peakFreq: npsdStats.peak?.freq ?? 0,
      min: npsdStats.min?.amp ?? 0,
      minFreq: npsdStats.min?.freq ?? 0,
      avg: npsdStats.avg ?? 0
    }
  };
}
