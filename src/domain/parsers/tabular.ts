// ============================================================================
// Mergen Scope — Tabular File Parser
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseTabular)
// ============================================================================

import type { DataPoint, RawTrace, TraceDomain } from "../../types/trace.ts";
import type { ParsedFile, WizardConfig } from "../../types/file.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Tabular parser
// ---------------------------------------------------------------------------

/** Parse a generic tabular (CSV/TSV/DAT) file. */
export function parseTabularFile(
  text: string,
  fileName: string,
  explicitConfig: WizardConfig | null,
): ParsedFile {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  let config = explicitConfig;
  const ext = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const isDat = ext === "dat";

  const splitRow = (line: string, delimiter: string) => line.split(delimiter).map((s) => s.trim());
  const isNumericRow = (parts: readonly string[]) => (
    parts.length >= 2
    && parts.every((part) => part !== "" && Number.isFinite(Number(part)))
  );
  const inferUnit = (header: string, axis: "x" | "y"): string | null => {
    const h = String(header ?? "");
    const parenthesized = h.match(/\(([^)]+)\)/)?.[1]?.trim();
    const candidate = parenthesized || h;
    const normalized = candidate.toLowerCase();
    if (axis === "x") {
      if (/\bghz\b/.test(normalized)) return "GHz";
      if (/\bmhz\b/.test(normalized)) return "MHz";
      if (/\bkhz\b/.test(normalized)) return "kHz";
      if (/\bhz\b/.test(normalized)) return "Hz";
      if (/\bms\b/.test(normalized)) return "ms";
      if (/\bus\b|\bµs\b/.test(normalized)) return "us";
      if (/\bns\b/.test(normalized)) return "ns";
      if (/\bs\b|time/.test(normalized)) return "s";
      return null;
    }
    if (/\bdbm\b/.test(normalized)) return "dBm";
    if (/\bdb\b/.test(normalized)) return "dB";
    if (/\bmv\b/.test(normalized)) return "mV";
    if (/\bv\b|volt/.test(normalized)) return "V";
    if (/\ba\b|ampere/.test(normalized)) return "A";
    return null;
  };

  if (!config) {
    // Heuristics engine
    const delims = [",", "\t", ";"] as const;
    let bestDelimiter = ",";
    let bestScore = 0;
    for (const d of delims) {
      const sample = lines.slice(0, 20).map((line) => splitRow(line, d).length);
      const maxColsForDelimiter = Math.max(0, ...sample);
      const rowsWithColumns = sample.filter((count) => count > 1).length;
      const score = maxColsForDelimiter * 100 + rowsWithColumns;
      if (score > bestScore) {
        bestScore = score;
        bestDelimiter = d;
      }
    }
    const maxCols = Math.max(0, ...lines.slice(0, 20).map((line) => splitRow(line, bestDelimiter).length));

    let skipRows = lines.length;
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const parts = splitRow(lines[i]!, bestDelimiter);
      if (isNumericRow(parts)) { skipRows = i; break; }
    }

    const headerLine = skipRows > 0 ? lines[skipRows - 1] : null;
    const headers = headerLine ? splitRow(headerLine, bestDelimiter).map((s) => s.toLowerCase()) : [];

    let xCol = 0;
    let hasExplicitXCol = false;
    const yCols: number[] = [];
    let domain: TraceDomain = isDat ? "frequency" : "time";
    let confidence = isDat ? 0.8 : 0.5;

    for (let idx = 0; idx < headers.length; idx++) {
      const h = headers[idx]!;
      const isFrequencyXHeader = h.indexOf("freq") !== -1 || h === "hz" || h === "f" || h.startsWith("frequency ");
      const isTimeXHeader = h.indexOf("time") !== -1 || h === "s" || h === "t" || h.startsWith("time ");
      if (!hasExplicitXCol && isFrequencyXHeader) { domain = "frequency"; xCol = idx; hasExplicitXCol = true; confidence += 0.25; }
      else if (!hasExplicitXCol && isTimeXHeader) { domain = "time"; xCol = idx; hasExplicitXCol = true; confidence += 0.25; }
      else if (h.indexOf("v") !== -1 || h.indexOf("ch") !== -1 || h.indexOf("amp") !== -1 || h.indexOf("db") !== -1 || h.indexOf("mag") !== -1) { yCols.push(idx); confidence += 0.2; }
    }

    if (yCols.length === 0) {
      for (let j = 0; j < maxCols; j++) { if (j !== xCol) yCols.push(j); }
      if (headers.length > 0 && hasExplicitXCol && yCols.length > 0) {
        confidence += 0.15;
      }
    }

    config = {
      delimiter: bestDelimiter,
      skipRows,
      xCol,
      yCols,
      xMult: 1,
      yMult: 1,
      domain,
      confidence,
      headers,
    } satisfies WizardConfig;

    if (confidence < 0.8) {
      return {
        format: "needs-import-wizard",
        text,
        fileName,
        suggestedConfig: config,
        previewLines: lines.slice(0, 100),
        meta: {},
        traces: [],
      };
    }
  }

  const traces: RawTrace[] = [];
  const datasetFamily = config.domain === 'time' ? 'waveform' : 'spectrum';
  const xHeader = config.headers?.[config.xCol] ?? "";
  const xUnit = inferUnit(xHeader, "x") ?? (config.domain === "time" ? "s" : "Hz");

  for (let yIdx = 0; yIdx < config.yCols.length; yIdx++) {
    const yColIdx = config.yCols[yIdx]!;
    const name = config.headers?.[yColIdx] ?? `CH${yIdx + 1}`;
    const trace = makeTrace(`${fileName} `, fileName, String(name), incrementFileCounter());
    (trace as { domain: TraceDomain }).domain = config.domain;
    (trace as { family: "spectrum" | "waveform" }).family = datasetFamily;
    (trace as { dn: string }).dn = `${fileName} ${name}`;
    (trace as { units: { x: string | null; y: string | null } }).units = {
      x: xUnit,
      y: inferUnit(String(name), "y"),
    };
    traces.push(trace);
  }

  for (let i = config.skipRows; i < lines.length; i++) {
    const row = lines[i]!.split(config.delimiter);
    if (row.length <= config.xCol) continue;
    const xVal = Number(row[config.xCol]) * (config.xMult || 1);
    if (isNaN(xVal)) continue;

      for (let tIdx = 0; tIdx < config.yCols.length; tIdx++) {
        const yCol = config.yCols[tIdx]!;
      if (row.length > yCol && row[yCol]?.trim() !== "") {
        const yVal = Number(row[yCol]) * (config.yMult || 1);
        if (!isNaN(yVal)) {
          (traces[tIdx]! as unknown as { data: DataPoint[] }).data.push({ freq: xVal, amp: yVal });
        }
      }
    }
  }

  const filtered = traces
    .map((trace) => ({ ...trace, data: normalizeTraceData(trace.data) }) as RawTrace)
    .filter((t) => t.data.length > 1);

  const datasets = filtered.map((trace) => buildSeriesDatasetFromTrace(trace, datasetFamily));
  const displayTraces = datasets.map((dataset, index) => buildScalarDisplayTraceFromSeriesDataset(dataset, dataset.series[0]!, filtered[index]!));

  return {
    format: "tabular",
    meta: { Domain: config.domain, Columns: String(config.yCols.length) },
    traces: filtered,
    datasets,
    displayTraces,
    rawText: text,
    suggestedConfig: config,
  };
}
