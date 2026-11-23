// ============================================================================
// Mergen Scope — Tabular File Parser
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseTabular)
// Unified onto tabular-detect.ts so auto-detection and wizard share one engine.
// ============================================================================

import type { DataPoint, RawTrace } from "../../types/trace.ts";
import type { ParsedFile, WizardConfig } from "../../types/file.ts";
import type { ScalarDisplayTrace } from "../../types/display.ts";
import { breaksFrequencyGaps } from "../sweep-bands.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { baseXUnit, detectElectricalXUnit, detectXUnit, detectYUnit, storedXUnit, storedYUnit } from "../import-units.ts";
import { contentLines, detectTabular, isNumber, splitCells, splitHeader } from "./tabular-detect.ts";

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
export function summarizeTabularPreview(lines: readonly string[], config: Pick<WizardConfig, "delimiter" | "valueDelimiter" | "skipRows" | "xCol">): TabularPreviewSummary {
  const start = Math.max(0, Math.floor(Number.isFinite(config.skipRows) ? config.skipRows : 0));
  let dataRows = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  for (let i = start; i < lines.length; i++) {
    const cell = splitCells(lines[i] ?? "", config)[config.xCol];
    if (cell === undefined || cell.trim() === "") continue;
    const x = Number(cell);
    if (!Number.isFinite(x)) continue;
    dataRows += 1;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
  }
  return { dataRows, xMin: dataRows ? xMin : null, xMax: dataRows ? xMax : null };
}

/** Infer a unit from a column header when WizardConfig has no explicit xUnit/yUnit. */
function inferHeaderUnit(header: string, axis: "x" | "y"): string | null {
  const h = String(header ?? "");
  if (axis === "x") {
    const primary = detectXUnit(h)?.unit;
    if (primary) return primary;
    const electrical = detectElectricalXUnit(h)?.unit;
    if (electrical) return electrical;
    if (/\btime\b/i.test(h)) return "s";
    return null;
  }
  return detectYUnit(h);
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
  const lines = contentLines(text);

  let config = explicitConfig;
  if (!config) {
    const detection = detectTabular(text);
    const packedOrSpace = Boolean(detection.config.valueDelimiter) || detection.config.delimiter === " ";
    if (detection.confidenceLevel === "low" && !packedOrSpace) {
      return {
        format: "needs-import-wizard",
        text,
        fileName,
        suggestedConfig: detection.config,
        previewLines: lines.slice(0, 100),
        meta: {},
        traces: [],
      };
    }
    config = detection.config;
  }

  let sourceHeaders: string[] | undefined;

  // Use the physical source header rather than possibly stale wizard labels.
  const firstDataRow = Math.max(0, Math.floor(Number.isFinite(config.skipRows) ? config.skipRows : 0));
  const headerRow = firstDataRow > 0 ? splitHeader(lines[firstDataRow - 1] ?? "", config, config.headers?.length ?? 0) : undefined;
  const physicalHeaders = headerRow?.some((cell) => cell !== "" && !Number.isFinite(Number(cell))) ? headerRow : undefined;
  if (physicalHeaders) sourceHeaders = physicalHeaders;

  const traces: { trace: RawTrace; column: number }[] = [];
  const datasetFamily = config.domain === "time" ? "waveform" : "spectrum";
  const xHeader = sourceHeaders?.[config.xCol] ?? config.headers?.[config.xCol] ?? "";
  // A wizard-picked unit means xMult already converts to the base unit.
  const xUnit = config.xUnit !== undefined
    ? storedXUnit(config.xUnit, config.domain)
    : inferHeaderUnit(xHeader, "x") ?? baseXUnit(config.domain);
  const pickedYUnit = config.yUnit;

  // skipRows comes from user input (wizard): only whole, non-negative row counts are valid indices.
  // A cell is a number only if it is non-empty and finite; a blank X skips the row, a blank Y skips that trace's point.
  const series: DataPoint[][] = config.yCols.map(() => []);
  for (let i = firstDataRow; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const row = splitCells(line, config);
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
      ...(breaksFrequencyGaps(config) ? { parameters: { sweepFormat: "multiband" } } : {}),
      dn: `${fileName} ${name.toLowerCase()}`,
      units: {
        x: xUnit,
        y: pickedYUnit !== undefined ? storedYUnit(pickedYUnit) : inferHeaderUnit(String(name), "y"),
      },
      data: series[yIdx] ?? [],
    };
    traces.push({ trace, column: yColIdx });
  }

  const surviving = traces
    .map(({ trace, column }) => ({ trace: { ...trace, data: normalizeTraceData(trace.data) }, column }))
    .filter(({ trace }) => trace.data.length > 1);
  const filtered = surviving.map(({ trace }) => trace);
  const columnIdentities = surviving.map(({ column }) => {
    const header = sourceHeaders?.[column];
    return header ? { index: column, header } : { index: column };
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
