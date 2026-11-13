// ============================================================================
// Mergen Scope — Ripple / Flatness Analysis
// ============================================================================
// Ported from: app-modules/range-analysis-helpers.js (computeRippleFlatness)
// ============================================================================

import type { DataPoint } from "../../types/trace.ts";
import { computeRangeStats } from "./range-stats.ts";

// ---------------------------------------------------------------------------
// Ripple result
// ---------------------------------------------------------------------------

/** Result of ripple/flatness computation. */
export interface RippleResult {
  readonly min: DataPoint;
  readonly max: DataPoint;
  readonly ripple: number;
  readonly spanHz: number;
}

// ---------------------------------------------------------------------------
// Ripple computation
// ---------------------------------------------------------------------------

/** Compute ripple (peak-to-peak) and flatness metrics over data points. */
export function computeRipple(
  data: readonly DataPoint[],
): RippleResult | null {
  const stats = computeRangeStats(data);
  if (!stats) return null;
  return {
    min: stats.min,
    max: stats.max,
    ripple: stats.max.amp - stats.min.amp,
    spanHz: stats.spanHz,
  };
}
