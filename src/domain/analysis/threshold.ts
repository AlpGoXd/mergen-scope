// ============================================================================
// Mergen Scope — Threshold Crossings Analysis
// ============================================================================
// Ported from: app-modules/range-analysis-helpers.js
// ============================================================================

import type { DataPoint } from "../../types/trace.ts";
import { findHorizontalCrossings } from "../trace-math.ts";

// ---------------------------------------------------------------------------
// Threshold crossing result
// ---------------------------------------------------------------------------

/** A single threshold crossing point. */
export interface ThresholdCrossing {
  readonly freq: number;
  readonly mode: string;
}

// ---------------------------------------------------------------------------
// Threshold crossing detection
// ---------------------------------------------------------------------------

/** Find all frequencies where the data crosses a threshold level. */
export function findThresholdCrossings(
  data: readonly DataPoint[],
  level: number,
): ThresholdCrossing[] {
  // Create a minimal trace-like object for findHorizontalCrossings
  const pseudoTrace = { name: "analysis-threshold", data, kind: "raw" as const } as Parameters<typeof findHorizontalCrossings>[0];
  const freqs = findHorizontalCrossings(pseudoTrace, level, null);
  return freqs.map((freq) => ({ freq, mode: "linear" }));
}
