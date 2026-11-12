// ============================================================================
// Mergen Scope — Tabular auto-detect (import wizard)
// ============================================================================
// Guesses delimiter, rows to skip, domain, units and column roles from the
// file content alone. The extension is never consulted.
// ============================================================================

import type { TraceDomain } from "../../types/trace.ts";
import type { WizardConfig } from "../../types/file.ts";
import { baseXUnit, detectXUnit, detectYUnit, findXUnit, findYUnit } from "../import-units.ts";

export type WizardDelimiter = "," | ";" | "\t";
export const WIZARD_DELIMITERS: readonly WizardDelimiter[] = [",", ";", "\t"];

/** Lines that hold content; the wizard counts rows over these, like parseTabularFile. */
export function contentLines(text: string): string[] {
  return String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
}

export function splitCells(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim());
}

function isNumber(cell: string): boolean {
  return cell !== "" && Number.isFinite(Number(cell));
}

/** A data row: at least two numeric cells, and every non-empty cell numeric. */
function isDataRow(cells: readonly string[]): boolean {
  let numeric = 0;
  for (const cell of cells) {
    if (cell === "") continue;
    if (!isNumber(cell)) return false;
    numeric += 1;
  }
  return numeric >= 2;
}

const SAMPLE_LINES = 60;

/** The delimiter that turns the most sample lines into numeric data rows; ties go to the most columns. */
export function detectDelimiter(lines: readonly string[]): WizardDelimiter {
  const sample = lines.slice(0, SAMPLE_LINES);
  let best: WizardDelimiter = ",";
  let bestScore = -1;
  for (const delimiter of WIZARD_DELIMITERS) {
    let dataRows = 0;
    let widest = 0;
    for (const line of sample) {
      const cells = splitCells(line, delimiter);
      if (isDataRow(cells)) dataRows += 1;
      if (cells.length > widest) widest = cells.length;
    }
    const score = dataRows * 1000 + (widest > 1 ? widest : 0);
    if (score > bestScore) { bestScore = score; best = delimiter; }
  }
  return best;
}

/** Rows before the first data row that is followed by another data row (or ends the file). */
export function detectSkipRows(lines: readonly string[], delimiter: string): number {
  const limit = Math.min(lines.length, 200);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (line === undefined || !isDataRow(splitCells(line, delimiter))) continue;
    const next = lines[i + 1];
    if (next === undefined || isDataRow(splitCells(next, delimiter))) return i;
  }
  return 0;
}

/** Column names from the row just above the data; without a text row there, columns are numbered. */
export function columnHeaders(lines: readonly string[], delimiter: string, skipRows: number): string[] {
  const width = Math.max(0, ...lines.slice(skipRows, skipRows + 20).map((line) => splitCells(line, delimiter).length));
  const row = skipRows > 0 ? lines[skipRows - 1] : undefined;
  const cells = row !== undefined ? splitCells(row, delimiter) : [];
  const named = cells.some((cell) => cell !== "" && !isNumber(cell));
  const count = Math.max(width, named ? cells.length : 0);
  return Array.from({ length: count }, (_, idx) => (named ? cells[idx] : undefined) || `Column ${idx + 1}`);
}

/** Columns whose data cells are mostly numbers (empty cells don't count against them). */
export function numericColumns(lines: readonly string[], delimiter: string, skipRows: number, width: number): number[] {
  const rows = lines.slice(skipRows, skipRows + 50).map((line) => splitCells(line, delimiter));
  const out: number[] = [];
  for (let col = 0; col < width; col++) {
    let filled = 0;
    let numeric = 0;
    for (const row of rows) {
      const cell = row[col];
      if (cell === undefined || cell === "") continue;
      filled += 1;
      if (isNumber(cell)) numeric += 1;
    }
    if (filled > 0 && numeric / filled >= 0.8) out.push(col);
  }
  return out;
}

const FREQ_NAME = /freq|\bhz\b|ghz|mhz|khz|^f$/i;
const TIME_NAME = /time|^t$|^sec|seconds?/i;
const INDEX_NAME = /^(#|n|no\.?|idx|index|sample|samples|point|points|pt)$/i;

export interface TabularDetection {
  readonly config: WizardConfig;
  /** 'high' when a column name or unit says frequency/time; 'low' when the numbers were the only clue. */
  readonly domainConfidence: "high" | "low";
}

function domainFromHeader(header: string): TraceDomain | null {
  const unit = detectXUnit(header);
  if (unit) return unit.domain;
  if (FREQ_NAME.test(header.trim())) return "frequency";
  if (TIME_NAME.test(header.trim())) return "time";
  return null;
}

/** Guess every wizard setting from the file text. */
export function detectTabular(text: string): TabularDetection {
  const lines = contentLines(text);
  const delimiter = detectDelimiter(lines);
  const skipRows = detectSkipRows(lines, delimiter);
  const headers = columnHeaders(lines, delimiter, skipRows);
  const numeric = numericColumns(lines, delimiter, skipRows, headers.length);
  const hasNames = skipRows > 0 && headers.some((header, idx) => header !== `Column ${idx + 1}`);

  // X: the first numeric column named like time/frequency, else the first numeric column.
  let xCol = numeric[0] ?? 0;
  let domain: TraceDomain | null = null;
  if (hasNames) {
    for (const col of numeric) {
      const found = domainFromHeader(headers[col] ?? "");
      if (found) { xCol = col; domain = found; break; }
    }
  }
  const domainConfidence: "high" | "low" = domain ? "high" : "low";
  if (!domain) domain = guessDomainFromValues(lines, delimiter, skipRows, xCol, headers);

  const yCols = numeric.filter((col) => col !== xCol && !(hasNames && INDEX_NAME.test(headers[col] ?? "")));

  const xHeader = hasNames ? headers[xCol] ?? "" : "";
  const xFound = detectXUnit(xHeader);
  const xUnit = findXUnit(domain, xFound?.domain === domain ? xFound.unit : undefined) ?? { id: baseXUnit(domain), factor: 1, base: baseXUnit(domain) };
  const yFound = hasNames ? yCols.map((col) => detectYUnit(headers[col] ?? "")).find((unit) => unit !== null) : undefined;
  const yUnit = findYUnit(yFound ?? "") ?? { id: "", factor: 1, base: "" };

  return {
    domainConfidence,
    config: {
      delimiter,
      skipRows,
      xCol,
      yCols,
      xMult: xUnit.factor,
      yMult: yUnit.factor,
      xUnit: xUnit.id,
      yUnit: yUnit.id,
      domain,
      confidence: domainConfidence === "high" ? 0.9 : 0.4,
      headers,
    },
  };
}

/** Without a telling column name: dBm/dB columns or large evenly rising X values read as frequency. */
function guessDomainFromValues(lines: readonly string[], delimiter: string, skipRows: number, xCol: number, headers: readonly string[]): TraceDomain {
  if (headers.some((header) => /\bdbm?\b/i.test(header))) return "frequency";
  const xs: number[] = [];
  for (const line of lines.slice(skipRows, skipRows + 50)) {
    const cell = splitCells(line, delimiter)[xCol];
    if (cell !== undefined && isNumber(cell)) xs.push(Number(cell));
  }
  const first = xs[0];
  const last = xs[xs.length - 1];
  if (first === undefined || last === undefined || xs.length < 2) return "time";
  return first >= 0 && last >= 1e3 && (last - first) / (xs.length - 1) >= 1 ? "frequency" : "time";
}

/** Data rows the settings would read (every content line after the skipped ones). */
export function countDataRows(lines: readonly string[], skipRows: number): number {
  return Math.max(0, lines.length - Math.max(0, skipRows));
}
