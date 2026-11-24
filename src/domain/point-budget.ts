// ============================================================================
// Mergen Scope — Format-Neutral Point Budget Policy
// ============================================================================
// Pure domain module (no React, no DOM, no parser/format imports).
// Estimates in-memory footprint of imported trace points and recommends
// integer decimation factors to keep interactive analysis responsive.
// ============================================================================

export const SOFT_POINT_LIMIT = 2_000_000;
export const LARGE_POINT_LIMIT = 10_000_000;
export const BYTES_PER_POINT = 48;
export const ANALYSIS_OVERHEAD_FACTOR = 1.5;
export const TAB_HEAP_BYTES = 4 * 1024 ** 3;

export type PointBudgetLevel = "ok" | "large" | "very-large" | "exceeds-tab";

export interface PointBudget {
  readonly totalPoints: number;
  readonly estimatedBytes: number;
  readonly level: PointBudgetLevel;
}

/** Classify total sample point count and estimate browser memory footprint. */
export function pointBudget(totalPoints: number): PointBudget {
  if (Number.isNaN(totalPoints) || totalPoints <= 0) {
    return { totalPoints: 0, estimatedBytes: 0, level: "ok" };
  }
  if (!Number.isFinite(totalPoints)) {
    return { totalPoints: Number.POSITIVE_INFINITY, estimatedBytes: Number.POSITIVE_INFINITY, level: "exceeds-tab" };
  }

  const safePoints = Math.floor(totalPoints);
  const estimatedBytes = Math.round(safePoints * BYTES_PER_POINT * ANALYSIS_OVERHEAD_FACTOR);

  let level: PointBudgetLevel;
  if (estimatedBytes >= TAB_HEAP_BYTES) {
    level = "exceeds-tab";
  } else if (safePoints <= SOFT_POINT_LIMIT) {
    level = "ok";
  } else if (safePoints <= LARGE_POINT_LIMIT) {
    level = "large";
  } else {
    level = "very-large";
  }

  return { totalPoints: safePoints, estimatedBytes, level };
}

function trimDotZero(formatted: string): string {
  return formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted;
}

/** Format a byte count using 1024-based B / KB / MB / GB units. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${trimDotZero((bytes / 1024).toFixed(1))} KB`;
  if (bytes < 1024 ** 3) return `${trimDotZero((bytes / 1024 ** 2).toFixed(1))} MB`;
  return `${trimDotZero((bytes / 1024 ** 3).toFixed(1))} GB`;
}

/** Return 1 if within `limit`, else the smallest integer N >= 2 with ceil(totalPoints / N) <= limit. */
export function recommendedDecimateFactor(totalPoints: number, limit = SOFT_POINT_LIMIT): number {
  if (!Number.isFinite(totalPoints) || totalPoints <= 0) return 1;
  const safeTotal = Math.floor(totalPoints);
  const safeLimit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : SOFT_POINT_LIMIT;
  if (safeTotal <= safeLimit) return 1;
  return Math.max(2, Math.ceil(safeTotal / safeLimit));
}
