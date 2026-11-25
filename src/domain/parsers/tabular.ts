// ============================================================================
// Mergen Scope — Tabular File Parser
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseTabular)
// Unified onto tabular-detect.ts so auto-detection and wizard share one engine.
// ============================================================================

import type { DataPoint, RawTrace } from "../../types/trace.ts";
import type { FileMetadata, ParsedFile, WizardConfig, WizardNetworkConfig } from "../../types/file.ts";
import type { ScalarDisplayTrace } from "../../types/display.ts";
import type { TouchstoneNetwork, TouchstoneSample } from "../../types/touchstone.ts";
import { breaksFrequencyGaps } from "../sweep-bands.ts";
import { makeTrace } from "../trace-model.ts";
import {
  buildNetworkDatasetFromTouchstone,
  buildScalarDisplayTraceFromSeriesDataset,
  buildSeriesDatasetFromTrace,
} from "../dataset-builders.ts";
import { makeComplexMatrix, touchstonePairToComplex } from "../touchstone-math.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { baseXUnit, detectElectricalXUnit, detectXUnit, detectYUnit, storedXUnit, storedYUnit } from "../import-units.ts";
import { columnDecimalLayout, contentLines, detectTabular, isTabularNumber, parseTabularNumber, splitCells, splitHeader } from "./tabular-detect.ts";

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
    const x = parseTabularNumber(cell, config);
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
  const physicalHeaders = headerRow?.some((cell) => cell !== "" && !isTabularNumber(cell, config)) ? headerRow : undefined;
  if (physicalHeaders) sourceHeaders = physicalHeaders;

  const xHeader = sourceHeaders?.[config.xCol] ?? config.headers?.[config.xCol] ?? "";
  if (config.network) {
    return parseTabularNetwork(text, fileName, config, config.network, lines, firstDataRow, sourceHeaders, xHeader);
  }

  const traces: { trace: RawTrace; column: number }[] = [];
  const datasetFamily = config.domain === "time" ? "waveform" : "spectrum";
  // A wizard-picked unit means xMult already converts to the base unit.
  const xUnit = config.xUnit !== undefined
    ? storedXUnit(config.xUnit, config.domain)
    : inferHeaderUnit(xHeader, "x") ?? baseXUnit(config.domain);
  const pickedYUnit = config.yUnit;

  // skipRows comes from user input (wizard): only whole, non-negative row counts are valid indices.
  // A cell is a number only if it is non-empty and finite; a blank X skips the row, a blank Y skips that trace's point.
  const xLayout = columnDecimalLayout(config, sourceHeaders?.[config.xCol]);
  const yLayouts = config.yCols.map((yCol) => columnDecimalLayout(config, sourceHeaders?.[yCol]));
  const series: DataPoint[][] = config.yCols.map(() => []);
  for (let i = firstDataRow; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const row = splitCells(line, config);
    const xCell = row[config.xCol];
    if (xCell === undefined || !isTabularNumber(xCell, xLayout)) continue;
    const xVal = parseTabularNumber(xCell, xLayout) * (config.xMult || 1);
    if (!Number.isFinite(xVal)) continue;

    config.yCols.forEach((yCol, tIdx) => {
      const yCell = row[yCol];
      const yLayout = yLayouts[tIdx];
      if (yCell === undefined || !isTabularNumber(yCell, yLayout)) return;
      const yVal = parseTabularNumber(yCell, yLayout) * (config.yMult || 1);
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

const RAD_TO_DEG = 180 / Math.PI;
const VALID_FREQ_UNITS = new Set(["Hz", "kHz", "MHz", "GHz", "THz"]);

function parseTabularNetwork(
  text: string,
  fileName: string,
  config: WizardConfig,
  network: WizardNetworkConfig,
  lines: readonly string[],
  firstDataRow: number,
  sourceHeaders: readonly string[] | undefined,
  xHeader: string,
): ParsedFile {
  const portCount = network.portCount;
  if (!Number.isInteger(portCount) || portCount < 1 || portCount > 4) {
    throw new Error(`Invalid S-parameter port count '${String(portCount)}' (expected 1 to 4).`);
  }
  if (network.format !== "RI" && network.format !== "MA" && network.format !== "DB") {
    throw new Error(`Unsupported S-parameter data format '${String(network.format)}'.`);
  }
  if (network.angleUnit !== "deg" && network.angleUnit !== "rad") {
    throw new Error(`Unsupported S-parameter angle unit '${String(network.angleUnit)}'.`);
  }
  if (!Number.isFinite(network.referenceOhms) || network.referenceOhms <= 0) {
    throw new Error("Reference impedance must be a positive finite number.");
  }
  if (!Number.isInteger(config.xCol) || config.xCol < 0) {
    throw new Error("Frequency column index must be a non-negative integer.");
  }
  if (!Array.isArray(network.cells) || network.cells.length === 0) {
    throw new Error("At least one S-parameter cell must be mapped.");
  }

  const dataRows: string[][] = [];
  let maxRowWidth = 0;
  for (let i = firstDataRow; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const row = splitCells(line, config);
    if (row.length > maxRowWidth) maxRowWidth = row.length;
    dataRows.push(row);
  }
  const headerWidth = Math.max(sourceHeaders?.length ?? 0, config.headers?.length ?? 0);
  const columnCount = Math.max(headerWidth, maxRowWidth);
  if (columnCount > 0 && config.xCol >= columnCount) {
    throw new Error(`Frequency column index ${config.xCol} is out of range (${columnCount} columns available).`);
  }

  const seenCells = new Set<string>();
  const usedCols = new Set<number>([config.xCol]);
  for (const cell of network.cells) {
    if (
      !Number.isInteger(cell.row)
      || !Number.isInteger(cell.col)
      || cell.row < 0
      || cell.row >= portCount
      || cell.col < 0
      || cell.col >= portCount
    ) {
      throw new Error(`S-parameter cell (${cell.row + 1}, ${cell.col + 1}) is out of range for a ${portCount}-port network.`);
    }
    const cellKey = `${cell.row}:${cell.col}`;
    if (seenCells.has(cellKey)) {
      throw new Error(`Duplicate S-parameter cell mapping for S${cell.row + 1}${cell.col + 1}.`);
    }
    seenCells.add(cellKey);

    if (!Number.isInteger(cell.first) || cell.first < 0 || !Number.isInteger(cell.second) || cell.second < 0) {
      throw new Error(`Column index for S${cell.row + 1}${cell.col + 1} must be a non-negative integer.`);
    }
    if (columnCount > 0 && (cell.first >= columnCount || cell.second >= columnCount)) {
      throw new Error(`Column index for S${cell.row + 1}${cell.col + 1} is out of range (${columnCount} columns available).`);
    }
    if (cell.first === cell.second) {
      throw new Error(`Duplicate column index ${cell.first} for S${cell.row + 1}${cell.col + 1}.`);
    }
    if (usedCols.has(cell.first)) {
      throw new Error(`Column index ${cell.first} is mapped more than once.`);
    }
    usedCols.add(cell.first);
    if (usedCols.has(cell.second)) {
      throw new Error(`Column index ${cell.second} is mapped more than once.`);
    }
    usedCols.add(cell.second);
  }

  const xMult = Number.isFinite(config.xMult) && config.xMult !== 0 ? config.xMult : 1;
  const toDeg = network.format !== "RI" && network.angleUnit === "rad";
  const samples: TouchstoneSample[] = [];
  let prevFreqHz = -Infinity;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    if (!row) continue;
    const xCell = row[config.xCol];
    if (xCell === undefined || !isTabularNumber(xCell, config)) continue;
    const freqHz = parseTabularNumber(xCell, config) * xMult;
    if (!Number.isFinite(freqHz)) continue;

    const pairs: { row: number; col: number; first: number; second: number }[] = [];
    let rowValid = true;
    for (const cell of network.cells) {
      const firstCell = row[cell.first];
      const secondCell = row[cell.second];
      if (
        firstCell === undefined
        || secondCell === undefined
        || !isTabularNumber(firstCell, config)
        || !isTabularNumber(secondCell, config)
      ) {
        rowValid = false;
        break;
      }
      const firstVal = parseTabularNumber(firstCell, config);
      const secondRaw = parseTabularNumber(secondCell, config);
      if (!Number.isFinite(firstVal) || !Number.isFinite(secondRaw)) {
        rowValid = false;
        break;
      }
      const secondVal = toDeg ? secondRaw * RAD_TO_DEG : secondRaw;
      pairs.push({ row: cell.row, col: cell.col, first: firstVal, second: secondVal });
    }
    if (!rowValid) continue;

    if (samples.length > 0 && freqHz <= prevFreqHz) {
      throw new Error(
        `S-parameter frequencies must be strictly increasing (row ${firstDataRow + idx + 1}: ${freqHz} Hz after ${prevFreqHz} Hz).`,
      );
    }
    prevFreqHz = freqHz;

    const matrix = makeComplexMatrix(portCount);
    for (const pair of pairs) {
      const targetRow = matrix[pair.row];
      if (targetRow) {
        targetRow[pair.col] = touchstonePairToComplex(network.format, pair.first, pair.second);
      }
    }
    samples.push({ freq: freqHz, sMatrix: matrix });
  }

  if (samples.length === 0) {
    throw new Error("No valid S-parameter data rows found.");
  }

  const missingCells: string[] = [];
  for (let r = 0; r < portCount; r++) {
    for (let c = 0; c < portCount; c++) {
      if (!seenCells.has(`${r}:${c}`)) {
        missingCells.push(`S${r + 1}${c + 1}`);
      }
    }
  }

  const rawFreqUnit = config.xUnit !== undefined ? config.xUnit : (inferHeaderUnit(xHeader, "x") ?? "Hz");
  const freqUnit = VALID_FREQ_UNITS.has(rawFreqUnit) ? rawFreqUnit : "Hz";

  const touchstoneNetwork: TouchstoneNetwork = {
    parameterType: "S",
    portCount,
    referenceOhms: Array.from({ length: portCount }, () => network.referenceOhms),
    freqUnit,
    dataFormat: network.format,
    comments: [],
    samples,
    matrixFormat: "full",
    version: 1,
    cellOrder: "spec",
  };

  const meta: FileMetadata = {
    "Format": "CSV (S-parameters)",
    "Port Count": String(portCount),
    "Data Format": network.format,
    "Reference": String(network.referenceOhms),
    ...(missingCells.length > 0 ? { "Not in file": missingCells.join(", ") } : {}),
  };

  const networkDataset = buildNetworkDatasetFromTouchstone(touchstoneNetwork, fileName);

  return {
    format: "touchstone",
    meta,
    touchstoneNetwork,
    traces: [],
    datasets: [networkDataset],
    displayTraces: [],
    rawText: text,
    suggestedConfig: config,
  };
}
