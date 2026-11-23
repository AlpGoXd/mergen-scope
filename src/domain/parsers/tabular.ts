// ============================================================================
// Mergen Scope — Tabular File Parser
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseTabular)
// ============================================================================

import type { DataPoint, RawTrace, TraceDomain } from "../../types/trace.ts";
import type { ParsedFile, WizardConfig } from "../../types/file.ts";
import type { ScalarDisplayTrace } from "../../types/display.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { baseXUnit, detectXUnit, findXUnit, storedYUnit } from "../import-units.ts";
import { isNumber } from "./tabular-detect.ts";

// ---------------------------------------------------------------------------
// Wizard preview summary
// ---------------------------------------------------------------------------

export interface TabularPreviewSummary {
  /** Rows (after the start row) whose X value parses as a number. */
  readonly dataRows: number;
  readonly xMin: number | null;
  readonly xMax: number | null;
}

/** What the wizard's current settings would read from the preview lines (same row rules as parseTabularFile). */
export function summarizeTabularPreview(lines: readonly string[], config: Pick<WizardConfig, "delimiter" | "skipRows" | "xCol">): TabularPreviewSummary {
  const start = Math.max(0, Math.floor(Number.isFinite(config.skipRows) ? config.skipRows : 0));
  let dataRows = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  for (let i = start; i < lines.length; i++) {
    const cell = lines[i]?.split(config.delimiter)[config.xCol];
    if (cell === undefined || cell.trim() === "") continue;
    const x = Number(cell);
    if (!Number.isFinite(x)) continue;
    dataRows += 1;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
  }
  return { dataRows, xMin: dataRows ? xMin : null, xMax: dataRows ? xMax : null };
}

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
  let sourceHeaders: string[] | undefined;
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
      const angle = detectXUnit(h)?.unit;
      if (angle === '°' || angle === 'rad') return angle;
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
    if (/\bdbi\b/.test(normalized)) return "dBi";
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
      const line = lines[i];
      if (line === undefined) continue;
      const parts = splitRow(line, bestDelimiter);
      if (isNumericRow(parts)) { skipRows = i; break; }
    }

    const headerLine = skipRows > 0 ? lines[skipRows - 1] : null;
    // Keep the source spelling for ColumnIdentity and unit inference. Heuristics
    // remain case-insensitive, and the user-facing trace name stays lowercase
    // for compatibility with older CSV imports.
    const headers = headerLine ? splitRow(headerLine, bestDelimiter) : [];
    const heuristicHeaders = headers.map((s) => s.toLowerCase());
    sourceHeaders = headers;

    let xCol = 0;
    let hasExplicitXCol = false;
    const yCols: number[] = [];
    let domain: TraceDomain = isDat ? "frequency" : "time";
    let confidence = isDat ? 0.8 : 0.5;

    for (const [idx, h] of heuristicHeaders.entries()) {
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
      headers: heuristicHeaders,
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

  // Use the physical source header rather than possibly stale wizard labels.
  const firstDataRow = Math.max(0, Math.floor(Number.isFinite(config.skipRows) ? config.skipRows : 0));
  const headerRow = firstDataRow > 0 ? lines[firstDataRow - 1]?.split(config.delimiter).map(cell => cell.trim()) : undefined;
  const physicalHeaders = headerRow?.some(cell => cell !== '' && !Number.isFinite(Number(cell))) ? headerRow : undefined;
  if (physicalHeaders) sourceHeaders = physicalHeaders;
  const traces: { trace: RawTrace; column: number }[] = [];
  const datasetFamily = config.domain === 'time' ? 'waveform' : 'spectrum';
  const xHeader = sourceHeaders?.[config.xCol] ?? config.headers?.[config.xCol] ?? "";
  // A wizard-picked unit means xMult already converts to the base unit.
  const xUnit = config.xUnit !== undefined ? findXUnit(config.domain, config.xUnit)?.base ?? baseXUnit(config.domain)
    : inferUnit(xHeader, "x") ?? baseXUnit(config.domain);
  const pickedYUnit = config.yUnit;

  // skipRows comes from user input (wizard): only whole, non-negative row counts are valid indices.
  // A cell is a number only if it is non-empty and finite; a blank X skips the row, a blank Y skips that trace's point.
  const series: DataPoint[][] = config.yCols.map(() => []);
  for (let i = firstDataRow; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const row = line.split(config.delimiter);
    const xCell = row[config.xCol];
    if (xCell === undefined || !isNumber(xCell)) continue;
    const xVal = Number(xCell) * (config.xMult || 1);
    if (!Number.isFinite(xVal)) continue;

    config.yCols.forEach((yCol, tIdx) => {
      const yCell = row[yCol];
      if (yCell === undefined || !isNumber(yCell)) return;
      const yVal = Number(yCell) * (config.yMult || 1);
      if (Number.isFinite(yVal)) series[tIdx]?.push({ freq: xVal, amp: yVal });
    });
  }

  for (const [yIdx, yColIdx] of config.yCols.entries()) {
    if (yColIdx === undefined) continue;
    const name = sourceHeaders?.[yColIdx] ?? config.headers?.[yColIdx] ?? `CH${yIdx + 1}`;
    const trace: RawTrace = {
      ...makeTrace(`${fileName} `, fileName, String(name), incrementFileCounter()),
      domain: config.domain,
      family: datasetFamily,
      dn: `${fileName} ${name.toLowerCase()}`,
      units: {
        x: xUnit,
        y: pickedYUnit !== undefined ? storedYUnit(pickedYUnit) : inferUnit(String(name), "y"),
      },
      data: series[yIdx] ?? [],
    };
    traces.push({ trace, column: yColIdx });
  }

  const surviving = traces
    .map(({ trace, column }) => ({ trace: { ...trace, data: normalizeTraceData(trace.data) }, column }))
    .filter(({trace}) => trace.data.length > 1);
  const filtered = surviving.map(({trace}) => trace);
  const columnIdentities = surviving.map(({ column }) => {
    const header = sourceHeaders?.[column];
    return header ? {index: column, header} : {index: column};
  });

  const datasets = filtered.map((trace) => buildSeriesDatasetFromTrace(trace, datasetFamily));
  const displayTraces: ScalarDisplayTrace[] = [];
  for (const [index, trace] of filtered.entries()) {
    const dataset = datasets[index];
    const firstSeries = dataset?.series[0];
    if (!dataset || !firstSeries) continue;
    displayTraces.push(buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace));
  }

  return {
    format: "tabular",
    meta: { Domain: config.domain, Columns: String(config.yCols.length) },
    traces: filtered,
    datasets,
    displayTraces,
    columnIdentities,
    rawText: text,
    suggestedConfig: config,
  };
}
