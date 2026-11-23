// ============================================================================
// Mergen Scope — Tabular auto-detect (import wizard)
// ============================================================================
// Guesses delimiter, rows to skip, domain, units and column roles from the
// file content alone. The extension is never consulted.
// ============================================================================

import type { TraceDomain } from "../../types/trace.ts";
import type { WizardConfig } from "../../types/file.ts";
import { baseXUnit, detectXUnit, detectYUnit, findXUnit, findYUnit } from "../import-units.ts";

export type WizardDelimiter = NonNullable<WizardConfig["valueDelimiter"]>;
export type Separators = Pick<WizardConfig, "delimiter" | "valueDelimiter">;
type RowLayout = string | Separators;
export const WIZARD_DELIMITERS: readonly WizardDelimiter[] = [",", ";", "\t", " "];

/** Lines that hold content; the wizard counts rows over these, like parseTabularFile. */
export function contentLines(text: string): string[] {
  return String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function splitFields(text: string, delimiter: string): string[] {
  return delimiter === " " ? text.trim().split(/\s+/) : text.split(delimiter).map(cell => cell.trim());
}

/** Only the first physical field uses the first separator in a mixed row. */
export function splitCells(line: string, layout: RowLayout): string[] {
  const delimiter = typeof layout === "string" ? layout : layout.delimiter;
  const values = typeof layout === "string" ? undefined : layout.valueDelimiter;
  if (!values || values === delimiter) return splitFields(line, delimiter);
  const row = delimiter === " " ? line.trimStart() : line;
  const boundary = delimiter === " " ? row.search(/\s/) : row.indexOf(delimiter);
  if (boundary < 0) return [row.trim()];
  const rest = row.slice(boundary + 1);
  return [row.slice(0, boundary).trim(), ...splitFields(delimiter === " " ? rest.trimStart() : rest, values)];
}

/** A cell is a number only if, once trimmed, it is non-empty and finite (Number("") is 0, so it needs the guard). */
export function isNumber(cell: string): boolean {
  const trimmed = cell.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed));
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

/** Prefer one separator when it explains the data. A second separator needs
 * repeated evidence from rows with at least two consistently positioned readings. */
export function detectSeparators(lines: readonly string[]): Separators {
  const sample = lines.slice(0, SAMPLE_LINES);
  let best: Separators = { delimiter: "," };
  let bestRows = -1;
  let bestWidth = 0;
  for (const delimiter of WIZARD_DELIMITERS) {
    const records = sample.map(line => splitCells(line, delimiter));
    const numeric = records.filter(isDataRow);
    const rows = numeric.length;
    const width = Math.max(0, ...(rows ? numeric : records).map(cells => cells.length));
    if (delimiter === " " && !rows) continue;
    if (rows > bestRows || (rows === bestRows && width > bestWidth)) {
      best = { delimiter };
      bestRows = rows;
      bestWidth = width;
    }
  }
  for (const delimiter of WIZARD_DELIMITERS) {
    for (const valueDelimiter of WIZARD_DELIMITERS) {
      if (delimiter === valueDelimiter) continue;
      const layout = { delimiter, valueDelimiter };
      const counts = new Map<number, number>();
      for (const line of sample) {
        const cells = splitCells(line, layout);
        if (cells.length < 3 || !isNumber(cells[0] ?? "") || !isDataRow(cells)) continue;
        counts.set(cells.length, (counts.get(cells.length) ?? 0) + 1);
      }
      const matches = Math.max(0, ...counts.values());
      if (matches >= 2 && matches > bestRows) {
        best = layout;
        bestRows = matches;
      }
    }
  }
  return best;
}

/** Rows before the first data row that is followed by another data row (or ends the file). */
export function detectSkipRows(lines: readonly string[], delimiter: RowLayout): number {
  const limit = Math.min(lines.length, 200);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (line === undefined || !isDataRow(splitCells(line, delimiter))) continue;
    const next = lines[i + 1];
    if (next === undefined || isDataRow(splitCells(next, delimiter))) return i;
  }
  return 0;
}

/** Some exports use the first separator for every heading and pack only the data rows. */
export function splitHeader(line: string, layout: RowLayout, width: number): string[] {
  if (typeof layout !== "string" && layout.valueDelimiter) {
    const headings = splitCells(line, layout.delimiter);
    if (headings.length === width && width > 2) return headings;
  }
  return splitCells(line, layout);
}

/** Column names from the row just above the data; without a text row there, columns are numbered. */
export function columnHeaders(lines: readonly string[], delimiter: RowLayout, skipRows: number): string[] {
  const width = Math.max(0, ...lines.slice(skipRows, skipRows + 20).map((line) => splitCells(line, delimiter).length));
  const row = skipRows > 0 ? lines[skipRows - 1] : undefined;
  const cells = row !== undefined ? splitHeader(row, delimiter, width) : [];
  const named = cells.some((cell) => cell !== "" && !isNumber(cell));
  if (skipRows === 0 && typeof delimiter !== "string" && delimiter.valueDelimiter) {
    return Array.from({ length: width }, (_, idx) => idx === 0 ? "Column 1" : `Trace ${idx}`);
  }
  const count = Math.max(width, named ? cells.length : 0);
  return Array.from({ length: count }, (_, idx) => (named ? cells[idx] : undefined) || `Column ${idx + 1}`);
}

/** Columns whose data cells are mostly numbers (empty cells don't count against them). */
export function numericColumns(lines: readonly string[], delimiter: RowLayout, skipRows: number, width: number): number[] {
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
  const separators = detectSeparators(lines);
  const skipRows = detectSkipRows(lines, separators);
  const headers = columnHeaders(lines, separators, skipRows);
  const numeric = numericColumns(lines, separators, skipRows, headers.length);
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
  if (!domain) domain = guessDomainFromValues(lines, separators, skipRows, xCol, headers);

  const yCols = numeric.filter((col) => col !== xCol && !(hasNames && INDEX_NAME.test(headers[col] ?? "")));

  const xHeader = hasNames ? headers[xCol] ?? "" : "";
  const xFound = detectXUnit(xHeader);
  const xUnit = findXUnit(domain, xFound?.domain === domain ? xFound.unit : undefined) ?? { id: baseXUnit(domain), factor: 1, base: baseXUnit(domain), name: baseXUnit(domain) };
  const yFound = hasNames ? yCols.map((col) => detectYUnit(headers[col] ?? "")).find((unit) => unit !== null) : undefined;
  // Time-domain captures are almost always voltages; frequency data keeps "no unit" unless named.
  const yUnit = findYUnit(yFound ?? (domain === "time" ? "V" : "")) ?? { id: "", factor: 1, base: "", name: "no unit" };

  return {
    domainConfidence,
    config: {
      ...separators,
      ...(domain === "frequency" && xUnit.base === "Hz" && hasSeparatedBands(lines, separators, skipRows, xCol) ? { breakSweepGaps: true } : {}),
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

/** Suggest a line break only with two stable sample intervals on each side of a jump. */
function hasSeparatedBands(lines: readonly string[], layout: Separators, start: number, xCol: number): boolean {
  let lastX: number | undefined;
  const steps: number[] = [];
  const similar = (a: number, b: number) => Math.abs(a - b) <= Math.abs(a) * 0.02;
  for (let i = start; i < lines.length; i++) {
    const cell = splitCells(lines[i] ?? "", layout)[xCol];
    if (!cell || !isNumber(cell)) continue;
    const x = Number(cell);
    if (lastX !== undefined) {
      steps.push(x - lastX);
      if (steps.length > 5) steps.shift();
      const [a, b, gap, c, d] = steps;
      if (a && b && gap && c && d && Math.sign(b) === Math.sign(gap) && Math.sign(c) === Math.sign(gap)
        && similar(a, b) && similar(c, d) && Math.abs(gap) >= 8 * Math.max(Math.abs(b), Math.abs(c))) return true;
    }
    lastX = x;
  }
  return false;
}

/** Without a telling column name: dBm/dB columns or large evenly rising X values read as frequency. */
function guessDomainFromValues(lines: readonly string[], delimiter: RowLayout, skipRows: number, xCol: number, headers: readonly string[]): TraceDomain {
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
