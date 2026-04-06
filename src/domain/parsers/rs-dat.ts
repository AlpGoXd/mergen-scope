// ============================================================================
// Mergen Scope — R&S DAT Parser
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseRSDat)
// ============================================================================

import type { DataPoint, RawTrace } from "../../types/trace.ts";
import type { ParsedFile, FileMetadata, MetadataEntry } from "../../types/file.ts";
import { makeTrace } from "../trace-model.ts";
import { normalizeTraceData, dedupeParsedTraces } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Module-level file counter
// ---------------------------------------------------------------------------

let _fc = 0;

export function resetParserFileCounter(): void { _fc = 0; }
export function syncParserFileCounter(fileCount: number): void { if (fileCount > _fc) _fc = fileCount; }
export function getParserFileCounter(): number { return _fc; }
export function incrementFileCounter(): number { return ++_fc; }

// ---------------------------------------------------------------------------
// R&S DAT parser
// ---------------------------------------------------------------------------

/** Parse a Rohde & Schwarz DAT file. */
export function parseRSDat(text: string, fileName: string): ParsedFile {
  _fc++;
  const prefix = fileName.replace(/\.[^.]+$/, "") + " ";
  const lines = text.split(/\r?\n/);
  const meta: Record<string, MetadataEntry> = {};
  const traces: RawTrace[] = [];
  let cur: { trace: RawTrace; data: DataPoint[] } | null = null;
  let inData = false;
  let hadTraceDecl = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) { if (inData) inData = false; continue; }
    const parts = trimmed.split(";").map((s) => s.trim());

    if (inData && cur) {
      const nums = parts.filter((s) => s !== "").map(Number);
      if (nums.length >= 2 && nums.every((n) => !isNaN(n))) {
        cur.data.push({ freq: nums[0]!, amp: nums[1]! });
        continue;
      }
      if (nums.length === 1 && !isNaN(nums[0]!)) {
        cur.data.push({ freq: 0, amp: nums[0]! }); // freq filled later
        continue;
      }
      inData = false;
    }

    if (/^Trace$/i.test(parts[0] ?? "") && parts[1] && /^\d+$/.test(parts[1])) {
      hadTraceDecl = true;
      const trace = makeTrace(prefix, fileName, `Tr${parts[1]}`, _fc);
      cur = { trace, data: [] };
      traces.push(trace);
      continue;
    }
    if (/^Trace Mode$/i.test(parts[0] ?? "") && cur) {
      (cur.trace as { mode: string }).mode = parts[1] ?? "";
      continue;
    }
    if (/^Detector$/i.test(parts[0] ?? "") && cur) {
      (cur.trace as { detector: string }).detector = parts[1] ?? "";
      continue;
    }
    if (/^Values$/i.test(parts[0] ?? "")) {
      inData = true;
      if (!cur) {
        const trace = makeTrace(prefix, fileName, `Tr${traces.length + 1}`, _fc);
        cur = { trace, data: [] };
        traces.push(trace);
      }
      continue;
    }
    if (parts.length >= 2 && /^[a-zA-Z]/.test(parts[0] ?? "")) {
      const nv = parseFloat(parts[1] ?? "");
      meta[parts[0]!] = !isNaN(nv) && parts[1] !== ""
        ? { value: nv, unit: parts[2] ?? "" }
        : (parts[1] ?? "");
    }
  }

  // Fallback: no trace declarations found
  if (traces.length === 0 && !hadTraceDecl) {
    const trace = makeTrace(prefix, fileName, "Tr1", _fc);
    const fallbackData: DataPoint[] = [];
    for (const line of lines) {
      const p = line.trim().split(";").filter((s) => s.trim() !== "").map(Number);
      if (p.length >= 2 && p.every((n) => !isNaN(n))) {
        fallbackData.push({ freq: p[0]!, amp: p[1]! });
      }
    }
    if (fallbackData.length > 0) {
      (trace as unknown as { data: DataPoint[] }).data = fallbackData;
      traces.push(trace);
    }
  }

  // Copy data to traces + fill missing frequencies
  for (let i = 0; i < traces.length; i++) {
    const traceEntry = traces[i]!;
    // Find matching cur entry
    const curEntry = cur && traces.indexOf(traceEntry) === traces.length - 1 ? cur : null;
    if (curEntry && curEntry.trace === traceEntry) {
      (traceEntry as unknown as { data: DataPoint[] }).data = curEntry.data;
    }
  }

  const sf = (meta["Start"] && typeof meta["Start"] === "object" && "value" in meta["Start"]) ? meta["Start"].value : 0;
  const ef = (meta["Stop"] && typeof meta["Stop"] === "object" && "value" in meta["Stop"]) ? meta["Stop"].value : 0;

  const finalTraces = dedupeParsedTraces(
    traces.filter((t) => t.data.length > 0).map((tr) => {
      let data = [...tr.data] as DataPoint[];
      if (data.length > 0 && data[0]!.freq === 0 && data.every((d) => d.freq === 0)) {
        const n = data.length;
        data = data.map((d, idx) => ({
          freq: sf + (idx / Math.max(n - 1, 1)) * (ef - sf),
          amp: d.amp,
        }));
      }
      data = normalizeTraceData(data);

      const xUnit = (meta["StartXAxis"] && typeof meta["StartXAxis"] === "object" && "unit" in meta["StartXAxis"]) ? meta["StartXAxis"].unit
        : (meta["StopXAxis"] && typeof meta["StopXAxis"] === "object" && "unit" in meta["StopXAxis"]) ? meta["StopXAxis"].unit
        : (meta["Center Freq"] && typeof meta["Center Freq"] === "object" && "unit" in meta["Center Freq"]) ? meta["Center Freq"].unit
        : "Hz";
      const yUnit = (meta["Ref Level"] && typeof meta["Ref Level"] === "object" && "unit" in meta["Ref Level"]) ? meta["Ref Level"].unit : "dBm";

      return {
        ...tr,
        data,
        units: { x: xUnit, y: yUnit },
      } as RawTrace;
    }),
  );

  return { format: "rs-dat", meta: meta as FileMetadata, traces: finalTraces };
}
