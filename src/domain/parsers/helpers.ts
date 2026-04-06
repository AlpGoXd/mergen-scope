// ============================================================================
// Mergen Scope — Parser Helpers (shared utilities)
// ============================================================================
// Ported from: app-modules/file-store-helpers.js
// ============================================================================

import type { DataPoint, Trace } from "../../types/trace.ts";

// ---------------------------------------------------------------------------
// Trace data normalization
// ---------------------------------------------------------------------------

/** Normalize trace data: filter invalid points, sort by freq, dedupe. */
export function normalizeTraceData(data: readonly DataPoint[]): DataPoint[] {
  if (!Array.isArray(data) || !data.length) return [];

  const rows = data
    .filter((d) => d && Number.isFinite(d.freq) && Number.isFinite(d.amp))
    .map((d) => ({ freq: Number(d.freq), amp: Number(d.amp) }));

  rows.sort((a, b) => a.freq - b.freq);

  const out: DataPoint[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.freq === row.freq) {
      // Duplicate freq: keep latest value
      out[out.length - 1] = row;
    } else {
      out.push(row);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trace deduplication
// ---------------------------------------------------------------------------

function traceSig(tr: Trace): string {
  if (!tr?.data?.length) return "";
  const a = tr.data[0]!;
  const b = tr.data[tr.data.length - 1]!;
  return [
    tr.kind ?? "raw", tr.operationType ?? "", tr.dn ?? "", tr.mode ?? "",
    tr.detector ?? "", tr.data.length,
    a.freq, a.amp, b.freq, b.amp,
  ].join("|");
}

/** Remove duplicate traces based on a content signature. */
export function dedupeParsedTraces<T extends Trace>(traces: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const tr of traces) {
    if (!tr?.data?.length) continue;
    const sig = traceSig(tr);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(tr);
  }
  return out;
}
