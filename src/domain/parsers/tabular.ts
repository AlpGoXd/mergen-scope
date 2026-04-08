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

  if (!config) {
    // Heuristics engine
    const delims = [",", "\t", ";"] as const;
    let bestDelimiter = ",";
    let maxCols = 0;
    for (const d of delims) {
      const cols = (lines[0] ?? "").split(d).length;
      if (cols > maxCols) { maxCols = cols; bestDelimiter = d; }
    }

    let skipRows = 0;
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const pts = lines[i]!.split(bestDelimiter).map(Number);
      if (!pts.some(isNaN)) { skipRows = i; break; }
    }

    const headers = skipRows > 0
      ? lines[skipRows - 1]!.split(bestDelimiter).map((s) => s.trim().toLowerCase())
      : [];

    let xCol = 0;
    const yCols: number[] = [];
    const ext = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
    const isDat = ext === "dat";
    let domain: TraceDomain = isDat ? "frequency" : "time";
    let confidence = isDat ? 0.8 : 0.5;

    for (let idx = 0; idx < headers.length; idx++) {
      const h = headers[idx]!;
      if (h.indexOf("freq") !== -1 || h.indexOf("hz") !== -1) { domain = "frequency"; xCol = idx; confidence += 0.2; }
      else if (h.indexOf("time") !== -1 || h === "s" || h === "t") { domain = "time"; xCol = idx; confidence += 0.2; }
      else if (h.indexOf("v") !== -1 || h.indexOf("ch") !== -1 || h.indexOf("amp") !== -1 || h.indexOf("db") !== -1) { yCols.push(idx); confidence += 0.2; }
    }

    if (yCols.length === 0) {
      for (let j = 0; j < maxCols; j++) { if (j !== xCol) yCols.push(j); }
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

  for (let yIdx = 0; yIdx < config.yCols.length; yIdx++) {
    const yColIdx = config.yCols[yIdx]!;
    const name = config.headers?.[yColIdx] ?? `CH${yIdx + 1}`;
    const trace = makeTrace(fileName, name, String(name), incrementFileCounter());
    (trace as { domain: TraceDomain }).domain = config.domain;
    (trace as { dn: string }).dn = `${fileName} ${name}`;
    traces.push(trace);
  }

  for (let i = config.skipRows; i < lines.length; i++) {
    const row = lines[i]!.split(config.delimiter);
    if (row.length <= config.xCol) continue;
    const xVal = Number(row[config.xCol]) * (config.xMult || 1);
    if (isNaN(xVal)) continue;

    for (let tIdx = 0; tIdx < config.yCols.length; tIdx++) {
      const yCol = config.yCols[tIdx]!;
      if (row.length > yCol) {
        const yVal = Number(row[yCol]) * (config.yMult || 1);
        if (!isNaN(yVal)) {
          (traces[tIdx]! as unknown as { data: DataPoint[] }).data.push({ freq: xVal, amp: yVal });
        }
      }
    }
  }

  const filtered = traces.filter((t) => t.data.length > 1);

  const datasetFamily = config.domain === 'time' ? 'waveform' : 'spectrum';
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
