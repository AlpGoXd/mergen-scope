// ============================================================================
// Mergen Scope — Derived State Helpers
// ============================================================================
// Ported from: app-modules/derived-state-helpers.js (39 lines)
// ============================================================================

import type { Trace } from "../types/trace.ts";
import { getTraceId, getTraceSourceIds } from "./trace-model.ts";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/** Result of reconciling the derived trace dependency graph. */
export interface ReconcileResult {
  /** Derived traces that are still valid. */
  readonly kept: readonly Trace[];

  /** Derived traces that were removed (broken dependencies). */
  readonly removed: readonly Trace[];

  /** Set of removed trace IDs (by value). */
  readonly removedIds: Readonly<Record<string, boolean>>;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Walk the derived trace graph and remove any derived traces whose source
 * traces have been deleted or are themselves being removed.
 */
export function reconcileDerivedTraceGraph(
  rawTr: readonly Trace[],
  derivedTraces: readonly Trace[],
  removedSeedIds: readonly string[],
): ReconcileResult {
  const validIds: Record<string, boolean> = {};
  for (const tr of rawTr ?? []) {
    const id = getTraceId(tr);
    if (id) validIds[id] = true;
  }

  const removedIds: Record<string, boolean> = {};
  for (const id of removedSeedIds ?? []) {
    if (id) removedIds[id] = true;
  }

  const kept: Trace[] = [];
  const removed: Trace[] = [];

  for (const tr of derivedTraces ?? []) {
    const id = getTraceId(tr);

    // If explicitly removed
    if (id && removedIds[id]) {
      removed.push(tr);
      continue;
    }

    // Check all source IDs are still valid
    const srcIds = getTraceSourceIds(tr);
    const ok =
      srcIds.length > 0 &&
      srcIds.every((srcId) => !!validIds[srcId] && !removedIds[srcId]);

    if (ok) {
      kept.push(tr);
      if (id) validIds[id] = true;
    } else {
      if (id) removedIds[id] = true;
      removed.push(tr);
    }
  }

  return { kept, removed, removedIds };
}
