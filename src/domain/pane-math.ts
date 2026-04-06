// ============================================================================
// Mergen Scope — Pane Math Functions
// ============================================================================
// Ported from: app-modules/pane-helpers.js (142 lines)
// NEW: canAssignTraceToPane for domain enforcement.
// ============================================================================

import type { Pane, PaneRenderMode, PaneAssignmentResult } from "../types/pane.ts";
import type { Trace } from "../types/trace.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_PANES = 1;
const MAX_PANES = 4;

// ---------------------------------------------------------------------------
// Pane count clamping
// ---------------------------------------------------------------------------

/** Clamp a pane count to the valid range [1, 4]. */
export function clampPaneCount(count: number | unknown): number {
  let n = Number(count);
  if (!Number.isFinite(n)) n = 1;
  n = Math.round(n);
  if (n < MIN_PANES) n = MIN_PANES;
  if (n > MAX_PANES) n = MAX_PANES;
  return n;
}

// ---------------------------------------------------------------------------
// Render mode normalization
// ---------------------------------------------------------------------------

/** Normalize a pane render mode string to a valid PaneRenderMode. */
export function normalizePaneRenderMode(
  renderMode: string | null | undefined,
): PaneRenderMode {
  let mode = String(renderMode ?? "cartesian").trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/_/g, "-");
  if (mode === "smithinverted") mode = "smith-inverted";
  if (mode !== "smith" && mode !== "smith-inverted" && mode !== "cartesian") mode = "cartesian";
  return mode as PaneRenderMode;
}

// ---------------------------------------------------------------------------
// Pane cloning
// ---------------------------------------------------------------------------

/** Clone a pane object with normalized render mode. */
export function clonePane(pane: Pane | null | undefined, index: number): Pane | null {
  if (!pane?.id) return null;
  return {
    id: pane.id,
    title: pane.title || `Pane ${index + 1}`,
    renderMode: normalizePaneRenderMode(pane.renderMode),
  };
}

// ---------------------------------------------------------------------------
// Pane building
// ---------------------------------------------------------------------------

/** Build an array of panes from a count, optionally preserving previous panes. */
export function buildPanes(
  mode: number,
  prevPanes?: readonly Pane[],
): Pane[] {
  const count = clampPaneCount(mode);
  const panes: Pane[] = [];
  const prevById: Record<string, Pane> = {};

  for (const pane of prevPanes ?? []) {
    if (pane?.id) prevById[pane.id] = pane;
  }

  for (let i = 1; i <= count; i++) {
    const id = `pane-${i}`;
    const prev = prevById[id] ?? null;
    panes.push({
      id,
      title: prev?.title ?? `Pane ${i}`,
      renderMode: normalizePaneRenderMode(prev?.renderMode),
    });
  }

  return panes;
}

// ---------------------------------------------------------------------------
// Pane normalization
// ---------------------------------------------------------------------------

/** Normalize a panes array, preserving existing pane metadata. */
export function normalizePanes(
  panes: readonly Pane[] | null | undefined,
  mode: number | null | undefined,
): Pane[] {
  let next = (Array.isArray(panes) ? panes : [])
    .map((p, i) => clonePane(p, i))
    .filter((p): p is Pane => p !== null);

  if (!next.length) {
    return buildPanes(mode ?? 1);
  }

  const count = clampPaneCount(mode ?? next.length);
  const built = buildPanes(count, next);
  const byId: Record<string, Pane> = {};
  for (const pane of next) byId[pane.id] = pane;

  return built.map((pane) => {
    const prev = byId[pane.id] ?? null;
    return {
      id: pane.id,
      title: prev?.title ?? pane.title,
      renderMode: normalizePaneRenderMode(prev?.renderMode ?? pane.renderMode),
    };
  });
}

// ---------------------------------------------------------------------------
// Trace-pane mapping
// ---------------------------------------------------------------------------

/** Normalize the trace→pane assignment map. */
export function normalizeTracePaneMap(
  allTr: readonly Trace[],
  prevMap: Readonly<Record<string, string>> | null,
  panes: readonly Pane[],
): Record<string, string> {
  const next: Record<string, string> = { ...(prevMap ?? {}) };
  const paneIds = panes.map((p) => p.id);
  const traceNames = allTr.map((tr) => tr.name);

  for (const name of traceNames) {
    const paneId = next[name];
    next[name] = paneId && paneIds.includes(paneId) ? paneId : "pane-1";
  }

  // Remove traces that no longer exist
  for (const name of Object.keys(next)) {
    if (!traceNames.includes(name)) delete next[name];
  }

  return next;
}

/** Get the pane ID a trace is assigned to. */
export function getTracePaneId(
  tracePaneMap: Readonly<Record<string, string>> | null | undefined,
  traceName: string,
): string {
  return tracePaneMap?.[traceName] ?? "pane-1";
}

/** Get all traces assigned to a specific pane. */
export function getPaneTraces(
  allTr: readonly Trace[],
  tracePaneMap: Readonly<Record<string, string>>,
  paneId: string,
): Trace[] {
  const id = paneId || "pane-1";
  return allTr.filter((tr) => getTracePaneId(tracePaneMap, tr.name) === id);
}

/** Normalize the pane→active-trace map. */
export function normalizePaneActiveTraceMap(
  allTr: readonly Trace[],
  tracePaneMap: Readonly<Record<string, string>>,
  panes: readonly Pane[],
  prevMap: Readonly<Record<string, string | null>> | null,
): Record<string, string | null> {
  const next: Record<string, string | null> = {};

  for (const pane of panes) {
    const traces = getPaneTraces(allTr, tracePaneMap, pane.id);
    const names = traces.map((tr) => tr.name);
    const prevName = prevMap?.[pane.id] ?? null;
    next[pane.id] = (prevName && names.includes(prevName))
      ? prevName
      : (traces[0]?.name ?? null);
  }

  return next;
}

/** Clear all trace assignments from a pane, moving them to the target pane. */
export function clearPaneAssignments(
  tracePaneMap: Readonly<Record<string, string>>,
  paneId: string,
  targetPaneId: string,
): Record<string, string> {
  const next: Record<string, string> = { ...tracePaneMap };
  for (const traceName of Object.keys(next)) {
    if (next[traceName] === paneId) next[traceName] = targetPaneId;
  }
  return next;
}

/** Get the ID of any pane that is not the given pane. */
export function getAlternatePaneId(
  panes: readonly Pane[],
  paneId: string,
): string {
  for (const pane of panes) {
    if (pane.id !== paneId) return pane.id;
  }
  return "pane-1";
}

// ---------------------------------------------------------------------------
// NEW: Pane domain enforcement
// ---------------------------------------------------------------------------

/**
 * Check whether a trace can be assigned to a pane based on domain compatibility.
 * Frequency traces cannot go into time-domain panes and vice versa.
 */
export function canAssignTraceToPane(
  trace: Trace,
  paneId: string,
  existingTraces: readonly Trace[],
  tracePaneMap: Readonly<Record<string, string>>,
): PaneAssignmentResult {
  // Find traces already in the target pane
  const paneTraces = existingTraces.filter(
    (t) => (tracePaneMap[t.name] ?? "pane-1") === paneId,
  );

  // If pane is empty, any trace can go in
  if (!paneTraces.length) {
    return { allowed: true };
  }

  // Check domain of existing traces in the pane
  const paneDomain = paneTraces[0]!.domain;
  if (trace.domain !== paneDomain) {
    return {
      allowed: false,
      reason: `Cannot assign a ${trace.domain}-domain trace to a pane containing ${paneDomain}-domain traces.`,
    };
  }

  return { allowed: true };
}
