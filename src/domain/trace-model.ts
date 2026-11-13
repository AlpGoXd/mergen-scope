// ============================================================================
// Mergen Scope — Trace Model Functions
// ============================================================================
// Ported from: app-modules/trace-model.js (252 lines)
// Pure functions for trace creation and accessors.
// ============================================================================

import type {
  DataPoint,
  Trace,
  RawTrace,
  DerivedTrace,
  OperationType,
  TraceUnits,
} from "../types/trace.ts";
import type { NetworkSource } from "../types/touchstone.ts";
import { FAMILY_DEFAULTS } from "./interpolation.ts";

// ---------------------------------------------------------------------------
// Trace ID counter (module-level state)
// ---------------------------------------------------------------------------

let _tid = 0;

/** Reset the trace ID counter. Used when clearing the workspace. */
export function resetTraceIdCounter(): void {
  _tid = 0;
}

/** Generate the next trace ID. */
export function makeTraceId(): string {
  _tid++;
  return `trace-${_tid}`;
}

/** Sync the trace ID counter from existing traces (e.g. after loading). */
export function syncTraceIdCounter(traces: readonly Trace[]): void {
  let maxId = 0;
  for (const trace of traces ?? []) {
    const id = trace?.id ? String(trace.id) : "";
    const match = id.match(/^trace-(\d+)$/);
    if (match?.[1] !== undefined) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > maxId) maxId = value;
    }
  }
  if (maxId > _tid) _tid = maxId;
}

// ---------------------------------------------------------------------------
// Trace creation
// ---------------------------------------------------------------------------

/** Create a new raw trace with standard defaults. */
export function makeTrace(
  prefix: string,
  fileName: string,
  traceLabel: string,
  fileCounter: number,
): RawTrace {
  const id = makeTraceId();
  return {
    id,
    kind: "raw" as const,
    sourceTraceIds: [id],
    operationType: null,
    parameters: null,
    units: { x: null, y: null },
    paneId: null,
    name: `${prefix}${traceLabel}_${fileCounter}`,
    mode: "",
    detector: "",
    family: "spectrum",
    domain: "frequency" as const,
    data: [],
    file: fileName,
    dn: `${prefix}${traceLabel}`,
    isUniform: false,
  };
}

/** Create a derived trace from a source trace and operation. */
export function createDerivedTrace(
  sourceTrace: Trace | null,
  operationType: OperationType | string,
  parameters: Record<string, unknown> | null,
  data: readonly DataPoint[],
  displayName?: string,
): DerivedTrace {
  const id = makeTraceId();
  const sourceId = getTraceId(sourceTrace);
  const op = (operationType || "derived") as OperationType;

  return {
    id,
    kind: "derived" as const,
    sourceTraceIds: sourceId
      ? [sourceId]
      : getTraceSourceIds(sourceTrace),
    operationType: op,
    parameters: parameters ?? {},
    units: sourceTrace?.units
      ? { ...sourceTrace.units }
      : { x: null, y: null },
    paneId: sourceTrace?.paneId ?? null,
    name: `drv_${op}_${id}`,
    mode: sourceTrace?.mode ?? "",
    detector: sourceTrace?.detector ?? "",
    family: sourceTrace?.family ?? "spectrum",
    data: Array.isArray(data) ? data : [],
    file: sourceTrace?.file ?? null,
    domain: sourceTrace?.domain ?? "frequency",
    isUniform: sourceTrace?.isUniform ?? false,
    interpolation: sourceTrace?.interpolation ?? (sourceTrace ? FAMILY_DEFAULTS[sourceTrace.family] : undefined),
    dn:
      displayName ??
      `${getTraceLabel(sourceTrace) || "Trace"} [${op}]`,
  };
}

// ---------------------------------------------------------------------------
// Trace kind predicates
// ---------------------------------------------------------------------------

/** Check if a trace is a raw (imported) trace. */
export function isRawTrace(tr: Trace | null | undefined): tr is RawTrace {
  return !!tr && (tr.kind ?? "raw") === "raw";
}

/** Check if a trace is a derived (computed) trace. */
export function isDerivedTrace(tr: Trace | null | undefined): tr is DerivedTrace {
  return !!tr && tr.kind === "derived";
}

// ---------------------------------------------------------------------------
// Trace accessors
// ---------------------------------------------------------------------------

/** Get the unique ID of a trace. */
export function getTraceId(tr: Trace | null | undefined): string | null {
  return tr ? (tr.id || tr.name || null) : null;
}

/** Get the display label of a trace. */
export function getTraceLabel(tr: Trace | null | undefined): string {
  return tr ? (tr.dn || tr.name || tr.id || "") : "";
}

/** Get the data array of a trace (never null). */
export function getTraceData(tr: Trace | null | undefined): readonly DataPoint[] {
  return tr && Array.isArray(tr.data) ? tr.data : [];
}

/** Get the source trace IDs of a trace. */
export function getTraceSourceIds(tr: Trace | null | undefined): readonly string[] {
  if (!tr) return [];
  if (isRawTrace(tr)) {
    const id = getTraceId(tr);
    return id ? [id] : [];
  }
  return Array.isArray(tr.sourceTraceIds)
    ? tr.sourceTraceIds.filter(Boolean)
    : [];
}

// ---------------------------------------------------------------------------
// Derived trace Y-unit mutation
// ---------------------------------------------------------------------------

/**
 * Set the Y unit on a derived trace. Returns a new trace object.
 * Note: despite the JS original mutating in place, this returns a copy.
 */
export function setDerivedTraceYUnit(
  trace: Trace,
  unit: string | null,
): Trace {
  const nextUnits: TraceUnits = {
    x: trace.units?.x ?? null,
    y: unit,
  };
  return { ...trace, units: nextUnits };
}

// ---------------------------------------------------------------------------
// File base name
// ---------------------------------------------------------------------------

/** Extract base name from a file path (no directory, no extension). */
export function getFileBaseName(fileName: string | null | undefined): string {
  const name = String(fileName ?? "").replace(/^.*[\\/]/, "");
  return name.replace(/\.[^.]+$/, "") || name || "";
}

// ---------------------------------------------------------------------------
// Touchstone trace helpers
// ---------------------------------------------------------------------------

/** Check if a trace is a Touchstone S-parameter trace. */
export function isTouchstoneTrace(trace: Trace | null | undefined): boolean {
  if (!trace) return false;
  const raw = trace as RawTrace;
  return !!(
    (raw.networkSource && raw.networkSource.parentFileId != null) ||
    (raw.touchstoneNetwork && typeof raw.touchstoneNetwork === "object")
  );
}

/** Get the network source metadata from a trace. */
export function getTouchstoneNetworkSource(
  trace: Trace | null | undefined,
): NetworkSource | null {
  if (!trace) return null;
  const raw = trace as RawTrace;
  return raw.networkSource && typeof raw.networkSource === "object"
    ? raw.networkSource
    : null;
}

/** Get the S-parameter family ("S", "Y", "Z") from a trace. */
export function getTouchstoneTraceFamily(
  trace: Trace | null | undefined,
): string {
  const src = getTouchstoneNetworkSource(trace);
  return src?.family ? String(src.family) : "";
}

/** Get the view mode ("dB", "Phase", etc.) from a trace. */
export function getTouchstoneTraceView(
  trace: Trace | null | undefined,
): string {
  const src = getTouchstoneNetworkSource(trace);
  return src?.view ? String(src.view) : "";
}

/** Get the metric name from a trace. */
export function getTouchstoneTraceMetric(
  trace: Trace | null | undefined,
): string {
  const src = getTouchstoneNetworkSource(trace);
  return src?.metric ? String(src.metric) : "";
}

// ---------------------------------------------------------------------------
// Touchstone trace labeling
// ---------------------------------------------------------------------------

/** Build a display label for a Touchstone trace. */
export function makeTouchstoneTraceLabel(
  fileName: string,
  family: string,
  row: number | null,
  col: number | null,
  view: string,
): string {
  const base = getFileBaseName(fileName);
  const cell =
    String(family ?? "").toUpperCase() +
    (Number.isFinite(row) ? String(row) : "") +
    (Number.isFinite(col) ? String(col) : "");
  const suffix = String(view ?? "").trim();
  return [base, cell, suffix]
    .filter((part) => !!String(part).trim())
    .join(" ");
}

/** Build a trace name (no spaces) for a Touchstone trace. */
export function makeTouchstoneTraceName(
  fileName: string,
  family: string,
  row: number | null,
  col: number | null,
  view: string,
): string {
  return makeTouchstoneTraceLabel(fileName, family, row, col, view).replace(
    /\s+/g,
    "_",
  );
}
