// ============================================================================
// Mergen Scope — Tabular auto-detect (import wizard)
// ============================================================================
// Guesses delimiter, rows to skip, X/Y units, sweep gaps, column roles and a
// 4-factor confidence score from the file content alone. Never checks extension.
// ============================================================================

import type { TraceDomain } from "../../types/trace.ts";
import type { WizardConfig } from "../../types/file.ts";
import {
  baseXUnit,
  detectElectricalXUnit,
  detectXUnit,
  detectYUnit,
  findXUnit,
  findYUnit,
} from "../import-units.ts";
import type { XUnitCategory } from "../import-units.ts";

export type WizardDelimiter = NonNullable<WizardConfig["valueDelimiter"]>;
export type Separators = Pick<WizardConfig, "delimiter" | "valueDelimiter">;
type RowLayout = string | Separators;
export const WIZARD_DELIMITERS: readonly WizardDelimiter[] = [",", ";", "\t", " "];

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceBreakdown {
  /** Delimiter consistency and numeric row cleanliness (0..1). */
  readonly structure: number;
  /** Certainty of X column quantity and unit (0..1). */
  readonly xAxis: number;
  /** Certainty of Y column names and units (0..1). */
  readonly yAxis: number;
  /** Sweep/data sanity: non-degenerate, monotonic, sweep gaps (0..1). */
  readonly data: number;
}

export interface TabularDetection {
  readonly config: WizardConfig;
  /** Overall confidence tier: high (>=0.80), medium (0.55..0.79), low (<0.55). */
  readonly confidenceLevel: ConfidenceLevel;
  /** 'high' when a column name or unit identifies X; 'low' when numbers were the only clue. */
  readonly domainConfidence: "high" | "low";
  /** Human label for the detected X axis quantity, e.g. "Time", "Frequency", "Angle", "Voltage". */
  readonly detectedXLabel: string;
  /** Concrete, actionable reasons when confidence is below 100%. */
  readonly confidenceReasons: readonly string[];
  /** Individual 0..1 factor scores used to compute config.confidence. */
  readonly confidenceFactors: ConfidenceBreakdown;
}

/** Lines that hold content; the wizard counts rows over these, like parseTabularFile. */
export function contentLines(text: string): string[] {
  return String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function splitFields(text: string, delimiter: string): string[] {
  return delimiter === " " ? text.trim().split(/\s+/) : text.split(delimiter).map((cell) => cell.trim());
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
    const records = sample.map((line) => splitCells(line, delimiter));
    const numeric = records.filter(isDataRow);
    const rows = numeric.length;
    const width = Math.max(0, ...(rows ? numeric : records).map((cells) => cells.length));
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
    if (line === undefined) continue;
    const cells = splitCells(line, delimiter);
    if (!isDataRow(cells)) continue;
    const next = lines[i + 1];
    if (next === undefined || isDataRow(splitCells(next, delimiter))) return i;
    // Handle a corrupted/blank second data row right after a matching-width column header.
    if (i > 0) {
      const prevCells = splitCells(lines[i - 1] ?? "", delimiter);
      const matchingHeader = prevCells.length === cells.length && prevCells.some((cell) => cell !== "" && !isNumber(cell));
      if (matchingHeader) {
        const lookahead = Math.min(lines.length, i + 6);
        for (let j = i + 2; j < lookahead; j++) {
          const later = lines[j];
          if (later !== undefined && isDataRow(splitCells(later, delimiter))) return i;
        }
      }
    }
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
    return Array.from({ length: width }, (_, idx) => (idx === 0 ? "Column 1" : `Trace ${idx}`));
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
    if (filled > 0 && (numeric / filled >= 0.8 || (numeric >= 2 && numeric / filled >= 0.6))) out.push(col);
  }
  return out;
}

const FREQ_NAME = /\bfreq(?:uency)?\b|\bhz\b|ghz|mhz|khz|thz|^f$/i;
const TIME_NAME = /\btime\b|^t$|\bsec(?:onds?)?\b/i;
const ANGLE_NAME = /\b(?:angle|azimuth|az|elevation|el|theta|phi|bearing|heading)\b/i;
const SWEEP_ELEC_NAME = /\b(?:vgs|vds|vbe|vce|vin|vdd|vbias|bias|pin|p_in|input\s*power|drive|gate|drain|source|sweep|dc\s*bias|control)\b/i;
const OUTPUT_COLUMN_NAME = /^(?:ch\d*|channel\s*\d*|out(?:put)?|vout|iout|pout|gain|level|mag(?:nitude)?|amp(?:litude)?|signal|trace\s*\d*|s\d\d|y\d*)$/i;
const INDEX_NAME = /^(#|n|no\.?|idx|index|sample|samples|point|points|pt)$/i;

interface XHeaderMatch {
  readonly domain: TraceDomain;
  readonly category: XUnitCategory;
  readonly unitId: string;
  readonly hasExplicitUnit: boolean;
  readonly quantityLabel: string;
}

function stripUnitAnnotation(header: string): string {
  return header.replace(/[([][^)\]]+[)\]]/g, "").trim();
}

function quantityLabelForUnit(unitId: string, category: XUnitCategory): string {
  if (category === "time") return "Time";
  if (category === "frequency") return "Frequency";
  if (category === "angle") return "Angle";
  if (category === "other") return "Unitless";
  const lower = unitId.toLowerCase();
  if (lower === "v" || lower === "mv") return "Voltage";
  if (lower === "a" || lower === "ma") return "Current";
  if (lower === "w" || lower === "mw" || lower === "dbm") return "Power";
  if (lower === "ohm") return "Impedance";
  if (lower === "db") return "Level";
  return "Electrical";
}

function primaryXFromHeader(header: string): XHeaderMatch | null {
  const unit = detectXUnit(header);
  if (unit) {
    return {
      domain: unit.domain,
      category: unit.category,
      unitId: unit.unit,
      hasExplicitUnit: true,
      quantityLabel: quantityLabelForUnit(unit.unit, unit.category),
    };
  }
  const trimmed = header.trim();
  if (FREQ_NAME.test(trimmed)) {
    return { domain: "frequency", category: "frequency", unitId: "Hz", hasExplicitUnit: false, quantityLabel: "Frequency" };
  }
  if (TIME_NAME.test(trimmed)) {
    return { domain: "time", category: "time", unitId: "s", hasExplicitUnit: false, quantityLabel: "Time" };
  }
  if (ANGLE_NAME.test(trimmed)) {
    return { domain: "frequency", category: "angle", unitId: "°", hasExplicitUnit: false, quantityLabel: "Angle" };
  }
  return null;
}

function electricalXFromHeader(header: string, isFirstNumeric: boolean): XHeaderMatch | null {
  const trimmed = header.trim();
  const baseName = stripUnitAnnotation(trimmed);
  const explicitSweep = SWEEP_ELEC_NAME.test(trimmed);
  const elecUnit = detectElectricalXUnit(trimmed);
  if (elecUnit && (explicitSweep || (isFirstNumeric && !OUTPUT_COLUMN_NAME.test(baseName)))) {
    return {
      domain: "frequency",
      category: "electrical",
      unitId: elecUnit.unit,
      hasExplicitUnit: true,
      quantityLabel: quantityLabelForUnit(elecUnit.unit, "electrical"),
    };
  }
  if (explicitSweep) {
    const inferredUnit = /\b(?:pin|p_in|input\s*power|drive)\b/i.test(trimmed) ? "dBm" : "V";
    return {
      domain: "frequency",
      category: "electrical",
      unitId: inferredUnit,
      hasExplicitUnit: false,
      quantityLabel: quantityLabelForUnit(inferredUnit, "electrical"),
    };
  }
  return null;
}

function evaluateStructure(
  lines: readonly string[],
  separators: Separators,
  skipRows: number,
  numeric: readonly number[],
  reasons: string[],
): number {
  const sample = lines.slice(skipRows, skipRows + SAMPLE_LINES);
  if (sample.length === 0 || numeric.length < 2) {
    reasons.push("Could not find at least two numeric columns");
    return 0.1;
  }
  let cleanRows = 0;
  const widthCounts = new Map<number, number>();
  for (const line of sample) {
    const cells = splitCells(line, separators);
    if (isDataRow(cells)) {
      cleanRows += 1;
      widthCounts.set(cells.length, (widthCounts.get(cells.length) ?? 0) + 1);
    }
  }
  const validRatio = cleanRows / sample.length;
  const modalWidthCount = Math.max(0, ...widthCounts.values());
  const consistentRatio = cleanRows > 0 ? modalWidthCount / cleanRows : 0;

  if (validRatio >= 0.95 && consistentRatio >= 0.9) return 1.0;
  if (validRatio >= 0.75 && consistentRatio >= 0.75) {
    reasons.push("Some rows are malformed or have irregular column counts");
    return 0.75;
  }
  if (validRatio >= 0.5 && consistentRatio >= 0.75) {
    reasons.push("Some rows are malformed or incomplete");
    return 0.55;
  }
  reasons.push("Many rows do not match the detected separator");
  return 0.35;
}

function evaluateDataSanity(
  lines: readonly string[],
  separators: Separators,
  skipRows: number,
  xCol: number,
  hasGaps: boolean,
  reasons: string[],
): number {
  const xs: number[] = [];
  const limit = Math.min(lines.length, skipRows + 200);
  for (let i = skipRows; i < limit; i++) {
    const cell = splitCells(lines[i] ?? "", separators)[xCol];
    if (cell !== undefined && isNumber(cell)) xs.push(Number(cell));
  }
  if (xs.length < 2) {
    reasons.push("X column has fewer than two numeric values");
    return 0.25;
  }
  let min = Infinity;
  let max = -Infinity;
  let increasing = 0;
  let decreasing = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    if (x < min) min = x;
    if (x > max) max = x;
    if (i > 0) {
      const prev = xs[i - 1]!;
      if (x > prev) increasing += 1;
      else if (x < prev) decreasing += 1;
    }
  }
  if (min === max) {
    reasons.push("All sampled X values are identical");
    return 0.25;
  }
  if (increasing > 0 && decreasing > 0) {
    reasons.push("X values are not monotonic (will be sorted on import)");
    return 0.75;
  }
  if (hasGaps) {
    reasons.push("Sweep gaps detected — check 'Break lines at sweep gaps'");
    return 0.85;
  }
  return 1.0;
}

/** Guess every wizard setting and compute a 4-factor confidence score from the file text. */
export function detectTabular(text: string): TabularDetection {
  const lines = contentLines(text);
  const separators = detectSeparators(lines);
  const skipRows = detectSkipRows(lines, separators);
  const headers = columnHeaders(lines, separators, skipRows);
  const numeric = numericColumns(lines, separators, skipRows, headers.length);
  const hasNames = skipRows > 0 && headers.some((header, idx) => header !== `Column ${idx + 1}`);

  // X: pass 1 prefers frequency/time/angle columns; pass 2 checks electrical sweep axes; else first numeric column.
  let xCol = numeric[0] ?? 0;
  let xMatch: XHeaderMatch | null = null;
  if (hasNames) {
    for (const col of numeric) {
      const found = primaryXFromHeader(headers[col] ?? "");
      if (found) { xCol = col; xMatch = found; break; }
    }
    if (!xMatch) {
      for (const [idx, col] of numeric.entries()) {
        const found = electricalXFromHeader(headers[col] ?? "", idx === 0);
        if (found) { xCol = col; xMatch = found; break; }
      }
    }
  }

  const domainConfidence: "high" | "low" = xMatch ? "high" : "low";
  const guessedDomain = xMatch ? xMatch.domain : guessDomainFromValues(lines, separators, skipRows, xCol, headers);
  const domain: TraceDomain = guessedDomain;
  const xUnitId = xMatch ? xMatch.unitId : baseXUnit(domain);
  const xUnit = findXUnit(xUnitId) ?? {
    id: baseXUnit(domain),
    factor: 1,
    base: baseXUnit(domain),
    name: baseXUnit(domain),
    category: domain === "time" ? ("time" as const) : ("frequency" as const),
    domain,
  };
  const detectedXLabel = xMatch ? xMatch.quantityLabel : (domain === "time" ? "Time" : "Frequency");

  const yCols = numeric.filter((col) => col !== xCol && !(hasNames && INDEX_NAME.test(headers[col] ?? "")));

  // Detect Y units across Y columns: if all recognized Y units agree, pick that unit;
  // if multiple distinct units exist across columns, leave undefined ("from column names") so each column keeps its own.
  const detectedYUnits = hasNames
    ? yCols.map((col) => detectYUnit(headers[col] ?? "")).filter((unit): unit is string => unit !== null)
    : [];
  const distinctYUnits = [...new Set(detectedYUnits)];
  const mixedYUnits = distinctYUnits.length > 1;
  const pickedYUnitId = mixedYUnits
    ? undefined
    : distinctYUnits[0] ?? (domain === "time" ? "V" : "");
  const yUnitObj = pickedYUnitId !== undefined ? findYUnit(pickedYUnitId) : undefined;

  const hasGaps = hasSeparatedBands(lines, separators, skipRows, xCol);

  // 4-factor confidence scoring
  const reasons: string[] = [];
  const structure = evaluateStructure(lines, separators, skipRows, numeric, reasons);

  let xAxis: number;
  const xHeader = hasNames ? (headers[xCol] ?? "").trim() : "";
  if (xMatch?.hasExplicitUnit) {
    xAxis = 1.0;
  } else if (xMatch) {
    xAxis = 0.6;
    reasons.push(`X column '${xHeader}' has no unit (assumed ${xUnit.id || "no unit"})`);
  } else if (hasNames) {
    xAxis = 0.35;
    reasons.push(`X column '${xHeader || `Column ${xCol + 1}`}' has no recognized unit or axis name (guessed ${detectedXLabel})`);
  } else {
    xAxis = 0.25;
    reasons.push(`No column headers; X axis and units are guessed from numbers`);
  }

  let yAxis: number;
  if (yCols.length === 0) {
    yAxis = 0;
    reasons.push("No numeric Y columns found");
  } else if (!hasNames) {
    yAxis = 0.35;
  } else if (detectedYUnits.length === yCols.length) {
    yAxis = 1.0;
  } else if (detectedYUnits.length > 0) {
    yAxis = 0.9;
  } else {
    yAxis = 0.7;
    reasons.push("Y column headers have no units");
  }

  const data = evaluateDataSanity(lines, separators, skipRows, xCol, hasGaps, reasons);

  let score = 0.25 * structure + 0.40 * xAxis + 0.15 * yAxis + 0.20 * data;
  if (yCols.length === 0) score = Math.min(score, 0.15);
  else if (structure < 0.5) score = Math.min(score, 0.45);
  else if (xAxis <= 0.35) score = Math.min(score, hasNames ? 0.48 : 0.40);
  else if (xAxis <= 0.65 || structure <= 0.6) score = Math.min(score, 0.78);
  const confidence = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  const confidenceLevel: ConfidenceLevel = confidence >= 0.8 ? "high" : confidence >= 0.55 ? "medium" : "low";

  return {
    confidenceLevel,
    domainConfidence,
    detectedXLabel,
    confidenceReasons: reasons,
    confidenceFactors: { structure, xAxis, yAxis, data },
    config: {
      ...separators,
      ...(hasGaps ? { breakSweepGaps: true } : {}),
      skipRows,
      xCol,
      yCols,
      xMult: xUnit.factor,
      yMult: yUnitObj?.factor ?? 1,
      xUnit: xUnit.id,
      ...(pickedYUnitId !== undefined ? { yUnit: yUnitObj?.id ?? pickedYUnitId } : {}),
      domain,
      confidence,
      headers,
    },
  };
}

/** Suggest a line break only with two stable sample intervals on each side of a jump. */
function hasSeparatedBands(lines: readonly string[], layout: Separators, start: number, xCol: number): boolean {
  let lastX: number | undefined;
  const steps: number[] = [];
  const similar = (a: number, b: number) => Math.abs(a - b) <= Math.abs(a) * 0.05;
  for (let i = start; i < lines.length; i++) {
    const cell = splitCells(lines[i] ?? "", layout)[xCol];
    if (!cell || !isNumber(cell)) continue;
    const x = Number(cell);
    if (lastX !== undefined) {
      steps.push(x - lastX);
      if (steps.length > 5) steps.shift();
      const [a, b, gap, c, d] = steps;
      if (
        a && b && gap && c && d
        && Math.sign(b) === Math.sign(gap)
        && Math.sign(c) === Math.sign(gap)
        && similar(a, b)
        && similar(c, d)
        && Math.abs(gap) >= 8 * Math.max(Math.abs(b), Math.abs(c))
      ) {
        return true;
      }
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
