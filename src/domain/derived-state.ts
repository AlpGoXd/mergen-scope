// ============================================================================
// Mergen Scope — Derived State Helpers
// ============================================================================
// Ported from: app-modules/derived-state-helpers.js (39 lines)
// ============================================================================

import type { Trace } from "../types/trace.ts";
import { computeBinaryTraceMathData, smoothTraceData } from "./trace-ops.ts";
import type { InterpolationMethod, SmoothingMethod } from "./trace-ops.ts";
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

/** Recalculate supported trace operations in dependency order after source data changes. */
export function recomputeDerivedTraces(raw: readonly Trace[], derived: readonly Trace[]): Trace[] {
  const sources = new Map(raw.map((trace) => [trace.id, trace]));
  return derived.map((trace) => {
    const first = sources.get(trace.sourceTraceIds[0] ?? "");
    const second = sources.get(trace.sourceTraceIds[1] ?? "");
    const params = trace.parameters ?? {};
    let data = trace.data;
    if (first && trace.operationType === "offset" && typeof params.offset === "number") {
      const offset = params.offset;
      data = first.data.map((point) => ({ ...point, amp: point.amp + offset }));
    } else if (first && trace.operationType === "scale" && typeof params.scale === "number") {
      const scale = params.scale;
      data = first.data.map((point) => ({ ...point, amp: point.amp * scale }));
    } else if (first && trace.operationType === "smooth" &&
      (params.method === "none" || params.method === "moving-average" || params.method === "median-filter" || params.method === "savitzky-golay")) {
      data = smoothTraceData(first.data, params.method as SmoothingMethod, params.window, params.polyOrder).data;
    } else if (first && second && (trace.operationType === "add" || trace.operationType === "subtract" || trace.operationType === "multiply" || trace.operationType === "divide")) {
      const mode = params.interpolation;
      const interpolation: InterpolationMethod = mode === "exact" || mode === "linear" || mode === "nearest" || mode === "previous" || mode === "next" || mode === "cubic" ? mode : "auto";
      data = computeBinaryTraceMathData(first.data, second.data, interpolation, trace.operationType).data ?? [];
    }
    const updated = data === trace.data ? trace : { ...trace, data };
    sources.set(updated.id, updated);
    return updated;
  });
}
