// ============================================================================
// Mergen Scope — Export Helpers
// ============================================================================
// Ported from: app-modules/export-helpers.js (cloneTraceForExport)
// ============================================================================

import type { Trace, DataPoint } from "../types/trace.ts";

// ---------------------------------------------------------------------------
// Clone trace for export
// ---------------------------------------------------------------------------

/** Clone a trace for export, stripping transient state. */
export function cloneTraceForExport(trace: Trace): Trace {
  if (!trace) return trace;

  return {
    ...trace,
    data: (trace.data ?? []).map((p: DataPoint) => ({
      freq: p.freq,
      amp: p.amp,
    })),
  };
}

// ---------------------------------------------------------------------------
// Format trace data as CSV
// ---------------------------------------------------------------------------

/** Format trace data as a CSV string. */
export function traceDataToCSV(
  trace: Trace,
  xHeader?: string,
  yHeader?: string,
): string {
  const xH = xHeader ?? "Frequency";
  const yH = yHeader ?? "Amplitude";
  const lines = [`${xH},${yH}`];
  for (const p of trace.data ?? []) {
    if (Number.isFinite(p.freq) && Number.isFinite(p.amp)) {
      lines.push(`${p.freq},${p.amp}`);
    }
  }
  return lines.join("\n");
}

/** Format multiple traces as CSV columns. */
export function tracesToCSV(
  traces: readonly Trace[],
  xHeader?: string,
): string {
  if (!traces.length) return "";

  const xH = xHeader ?? "Frequency";
  const headers = [xH, ...traces.map((tr) => tr.dn || tr.name || "Trace")];

  // Collect all unique frequencies
  const freqSet = new Set<number>();
  for (const tr of traces) {
    for (const p of tr.data ?? []) {
      if (Number.isFinite(p.freq)) freqSet.add(p.freq);
    }
  }
  const freqs = Array.from(freqSet).sort((a, b) => a - b);

  // Build amplitude lookup per trace
  const lookups: Map<number, number>[] = traces.map((tr) => {
    const map = new Map<number, number>();
    for (const p of tr.data ?? []) {
      if (Number.isFinite(p.freq) && Number.isFinite(p.amp)) map.set(p.freq, p.amp);
    }
    return map;
  });

  const lines = [headers.join(",")];
  for (const freq of freqs) {
    const row = [String(freq)];
    for (const lookup of lookups) {
      const amp = lookup.get(freq);
      row.push(amp !== undefined ? String(amp) : "");
    }
    lines.push(row.join(","));
  }

  return lines.join("\n");
}
