// ============================================================================
// Mergen Scope — R&S DAT Parser
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseRSDat)
// ============================================================================

import type { DataPoint, RawTrace } from "../../types/trace.ts";
import type { ParsedFile, FileMetadata, MetadataEntry } from "../../types/file.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { normalizeTraceData, dedupeParsedTraces } from "./helpers.ts";
import { isNumber } from "./tabular-detect.ts";

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

/** Cells of a ";" row without the trailing blanks that a closing ";" leaves. */
function withoutTrailingBlanks(parts: readonly string[]): string[] {
  let end = parts.length;
  while (end > 0 && parts[end - 1] === "") end--;
  return parts.slice(0, end);
}

/** A cell that reads as a number word or blank (including NaN and Infinity), so its row is a data row even if it is a bad one. */
function isNumberLike(cell: string): boolean {
  return cell === "" || !Number.isNaN(Number(cell)) || /^[+-]?NaN$/i.test(cell);
}

/** Parse a Rohde & Schwarz DAT file. */
export function parseRSDat(text: string, fileName: string): ParsedFile {
  _fc++;
  const prefix = fileName.replace(/\.[^.]+$/, "") + " ";
  const lines = text.split(/\r?\n/);
  const meta: Record<string, MetadataEntry> = {};
  const traces: RawTrace[] = [];
  let cur: { trace: RawTrace; data: DataPoint[] } | null = null;
  const blocks: { trace: RawTrace; data: DataPoint[] }[] = [];
  let inData = false;
  let hadTraceDecl = false;
  // Values per row (1 = amplitude only, 2 = frequency and amplitude): the first good row of a block sets it.
  let rowShape: 1 | 2 | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) { if (inData) inData = false; continue; }
    const parts = trimmed.split(";").map((s) => s.trim());

    if (inData && cur) {
      const cells = withoutTrailingBlanks(parts);
      if (cells.length > 0 && cells.every(isNumberLike)) {
        // A blank cell before the last value, or a non-finite number, is a bad row: skip it, the block goes on.
        if (!cells.every(isNumber)) continue;
        const shape = cells.length >= 2 ? 2 : 1;
        rowShape ??= shape;
        // A row of the other shape is a row with a missing cell (for example "2;"), not an amplitude at frequency 0.
        if (shape !== rowShape) continue;
        // One value is an amplitude only; its frequency is filled in later from Start/Stop.
        cur.data.push(shape === 2 ? { freq: Number(cells[0]), amp: Number(cells[1]) } : { freq: 0, amp: Number(cells[0]) });
        continue;
      }
      inData = false;
    }

    if (/^Trace$/i.test(parts[0] ?? "") && parts[1] && /^\d+$/.test(parts[1])) {
      hadTraceDecl = true;
      const trace = makeTrace(prefix, fileName, `Tr${parts[1]}`, _fc);
      cur = { trace, data: [] };
      rowShape = null;
      blocks.push(cur);
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
      rowShape = null;
      blocks.push(cur);
        traces.push(trace);
      }
      continue;
    }
    if (parts.length >= 2 && /^[a-zA-Z]/.test(parts[0] ?? "")) {
      const nv = parseFloat(parts[1] ?? "");
      meta[parts[0]!] = Number.isFinite(nv) && parts[1] !== ""
        ? { value: nv, unit: parts[2] ?? "" }
        : (parts[1] ?? "");
    }
  }

  // Fallback: no trace declarations found
  if (traces.length === 0 && !hadTraceDecl) {
    const trace = makeTrace(prefix, fileName, "Tr1", _fc);
    const fallbackData: DataPoint[] = [];
    for (const line of lines) {
      const cells = withoutTrailingBlanks(line.trim().split(";").map((part) => part.trim()));
      if (cells.length >= 2 && cells.every(isNumber)) {
        fallbackData.push({ freq: Number(cells[0]), amp: Number(cells[1]) });
      }
    }
    if (fallbackData.length > 0) {
      traces.push({ ...trace, data: fallbackData });
    }
  }

  // Copy each block's data to its own trace (multi-trace files have one block per "Trace;N")
  const withData: RawTrace[] = traces.map((tr) => {
    const block = blocks.find((item) => item.trace === tr);
    return block ? { ...tr, data: block.data } : tr;
  });

  const sf = (meta["Start"] && typeof meta["Start"] === "object" && "value" in meta["Start"]) ? meta["Start"].value : 0;
  const ef = (meta["Stop"] && typeof meta["Stop"] === "object" && "value" in meta["Stop"]) ? meta["Stop"].value : 0;

  const finalTraces = dedupeParsedTraces(
    withData.filter((t) => t.data.length > 0).map((tr) => {
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

  const datasets = finalTraces.map((trace) => buildSeriesDatasetFromTrace(trace, "spectrum"));
  const displayTraces = datasets.map((dataset, index) => buildScalarDisplayTraceFromSeriesDataset(dataset, dataset.series[0]!, finalTraces[index]!));

  return { format: "rs-dat", meta: meta as FileMetadata, traces: finalTraces, datasets, displayTraces };
}
