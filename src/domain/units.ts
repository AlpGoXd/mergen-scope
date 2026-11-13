// ============================================================================
// Mergen Scope — Unit Functions
// ============================================================================
// Ported from: app-modules/trace-model.js:88-176 + app-controller.js:958-989
// Consolidates unit normalization, compatibility, and axis info derivation.
// ============================================================================

import type {
  YUnit,
  PhysicalDimension,
  UnitInfo,
  AxisInfo,
} from "../types/units.ts";
import type { Trace } from "../types/trace.ts";

// ---------------------------------------------------------------------------
// Unit normalization
// ---------------------------------------------------------------------------

/** Normalize a unit string: trim, lowercase, collapse whitespace. */
export function normalizeUnitName(unit: string | null | undefined): string {
  return String(unit ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// Engineering scalar formatting and input parsing
// ---------------------------------------------------------------------------

interface EngineeringPrefix {
  readonly symbol: string;
  readonly aliases: readonly string[];
  readonly factor: number;
}

const ENGINEERING_PREFIXES: readonly EngineeringPrefix[] = [
  { symbol: "Q", aliases: ["Q"], factor: 1e30 },
  { symbol: "R", aliases: ["R"], factor: 1e27 },
  { symbol: "Y", aliases: ["Y"], factor: 1e24 },
  { symbol: "Z", aliases: ["Z"], factor: 1e21 },
  { symbol: "E", aliases: ["E"], factor: 1e18 },
  { symbol: "P", aliases: ["P"], factor: 1e15 },
  { symbol: "T", aliases: ["T"], factor: 1e12 },
  { symbol: "G", aliases: ["G"], factor: 1e9 },
  { symbol: "M", aliases: ["M"], factor: 1e6 },
  { symbol: "k", aliases: ["k", "K"], factor: 1e3 },
  { symbol: "", aliases: [""], factor: 1 },
  { symbol: "m", aliases: ["m"], factor: 1e-3 },
  { symbol: "µ", aliases: ["u", "µ", "μ"], factor: 1e-6 },
  { symbol: "n", aliases: ["n"], factor: 1e-9 },
  { symbol: "p", aliases: ["p"], factor: 1e-12 },
  { symbol: "f", aliases: ["f"], factor: 1e-15 },
  { symbol: "a", aliases: ["a"], factor: 1e-18 },
  { symbol: "z", aliases: ["z"], factor: 1e-21 },
  { symbol: "y", aliases: ["y"], factor: 1e-24 },
  { symbol: "r", aliases: ["r"], factor: 1e-27 },
  { symbol: "q", aliases: ["q"], factor: 1e-30 },
];

interface EngineeringUnit {
  readonly symbol: string;
  readonly dimension: string;
  readonly prefixable: boolean;
  readonly aliases: readonly string[];
  readonly caseSensitiveAliases?: readonly string[];
}

const ENGINEERING_UNITS: readonly EngineeringUnit[] = [
  { symbol: "Hz", dimension: "frequency", prefixable: true, aliases: ["hz"] },
  {
    symbol: "s",
    dimension: "time",
    prefixable: true,
    aliases: ["sec", "secs", "second", "seconds"],
    caseSensitiveAliases: ["s"],
  },
  { symbol: "V", dimension: "voltage", prefixable: true, aliases: ["v"] },
  { symbol: "A", dimension: "current", prefixable: true, aliases: ["amp", "amps", "ampere", "amperes"], caseSensitiveAliases: ["A"] },
  { symbol: "W", dimension: "power", prefixable: true, aliases: ["w"] },
  { symbol: "S", dimension: "conductance", prefixable: true, aliases: ["siemens"], caseSensitiveAliases: ["S"] },
  { symbol: "F", dimension: "capacitance", prefixable: true, aliases: ["farad", "farads"], caseSensitiveAliases: ["F"] },
  { symbol: "H", dimension: "inductance", prefixable: true, aliases: ["h"] },
  { symbol: "Ohm", dimension: "resistance", prefixable: true, aliases: ["ohm", "ohms", "omega", "ω", "Ω"] },
  { symbol: "dB", dimension: "log-level", prefixable: false, aliases: ["db"] },
  { symbol: "dBm", dimension: "log-level", prefixable: false, aliases: ["dbm"] },
  { symbol: "dBW", dimension: "log-level", prefixable: false, aliases: ["dbw"] },
  { symbol: "dBV", dimension: "log-level", prefixable: false, aliases: ["dbv"] },
  { symbol: "dBuV", dimension: "log-level", prefixable: false, aliases: ["dbuv", "dbµv", "dbμv"] },
  { symbol: "dBmV", dimension: "log-level", prefixable: false, aliases: ["dbmv"] },
  { symbol: "dBc", dimension: "log-level", prefixable: false, aliases: ["dbc"] },
  { symbol: "dBFS", dimension: "log-level", prefixable: false, aliases: ["dbfs"] },
];

function matchEngineeringUnit(text: string): EngineeringUnit | undefined {
  return ENGINEERING_UNITS.find((unit) =>
    unit.caseSensitiveAliases?.includes(text) === true || unit.aliases.includes(text.toLowerCase()),
  );
}

function isLogEngineeringUnit(unit: string): boolean {
  const normalized = unit.trim().toLowerCase();
  return normalized === "db" || normalized.startsWith("dbm") || normalized.startsWith("dbw")
    || normalized.startsWith("dbv") || normalized.startsWith("dbc") || normalized.startsWith("dbfs");
}

function matchFormatUnit(unitText: string): EngineeringUnit | undefined {
  const exact = matchEngineeringUnit(unitText);
  if (exact) return exact;

  // Formatter callers provide a base unit. Recognize the common base symbols
  // without making their capitalization alter the printed unit label.
  const canonical = unitText.toLowerCase();
  return ENGINEERING_UNITS.find((unit) => unit.prefixable && unit.aliases.includes(canonical));
}

function chooseEngineeringPrefix(reference: number): EngineeringPrefix {
  const magnitude = Math.abs(reference);
  if (magnitude === 0) {
    return ENGINEERING_PREFIXES.find((prefix) => prefix.factor === 1)
      ?? { symbol: "", aliases: [""], factor: 1 };
  }
  return ENGINEERING_PREFIXES.find((prefix) => magnitude >= prefix.factor)
    ?? ENGINEERING_PREFIXES[ENGINEERING_PREFIXES.length - 1]
    ?? { symbol: "", aliases: [""], factor: 1 };
}

/** Scale used by the engineering formatter for a reference value. */
export function engineeringScale(reference: number): number {
  return chooseEngineeringPrefix(reference).factor;
}

/**
 * One SI prefix for a whole column of values that reach `reference`, and the unit to print with it
 * (3e9 with "Hz" gives factor 1e9 and "GHz"). Log and non-prefixable units (dB, deg …) keep factor 1.
 */
export function engineeringUnitLabel(reference: number, unit: string | null | undefined): { readonly factor: number; readonly unit: string } {
  const text = String(unit ?? "").trim();
  const info = matchFormatUnit(text);
  if (!text || isLogEngineeringUnit(text) || !info?.prefixable) return { factor: 1, unit: text };
  const prefix = chooseEngineeringPrefix(Number.isFinite(reference) ? reference : 0);
  return { factor: prefix.factor, unit: `${prefix.symbol}${info.symbol}` };
}

function decimalsForStep(step: number, factor: number): number | null {
  const scaledStep = Math.abs(step) / factor;
  if (!Number.isFinite(scaledStep) || scaledStep <= 0) return null;
  const tolerance = Math.abs(scaledStep) * 1e-12;
  for (let decimals = 0; decimals <= 15; decimals += 1) {
    const scale = 10 ** decimals;
    const roundedStep = Math.round(scaledStep * scale) / scale;
    if (Math.abs(roundedStep - scaledStep) <= tolerance) return decimals;
  }
  return null;
}

function trimZeroFraction(text: string): string {
  const decimalIndex = text.indexOf(".");
  if (decimalIndex < 0) return text;
  const fraction = text.slice(decimalIndex + 1);
  if (!/^0+$/.test(fraction)) return text;
  return text.slice(0, decimalIndex);
}

function groupFrequencyFraction(text: string): string {
  const decimalIndex = text.indexOf(".");
  if (decimalIndex < 0) return text;
  const integer = text.slice(0, decimalIndex);
  const fraction = text.slice(decimalIndex + 1);
  if (fraction.length <= 3) return text;
  const groups = fraction.match(/.{1,3}/g);
  return groups ? `${integer}.${groups.join(" ")}` : text;
}

function formatExponentialScalar(value: number, unitText: string, prefix: EngineeringPrefix): string {
  const scaled = value / prefix.factor;
  const mantissa = scaled.toExponential().replace(/-/g, "−").replace(/(?:\.0+|(?<=\d)0+)e/, "e");
  return `${mantissa} ${prefix.symbol}${unitText}`.trim();
}

/**
 * Format one scalar using a stable SI prefix and a base-unit tick step.
 * Prefix selection uses max(|value|, |step|); use the existing range-aware
 * batch formatters when a whole axis needs one shared prefix.
 */
export function formatEng(
  value: number,
  unit: string | null | undefined,
  step: number,
): string {
  if (!Number.isFinite(value)) return "--";

  const unitText = String(unit ?? "").trim();
  const logUnit = isLogEngineeringUnit(unitText);
  const unitInfo = matchFormatUnit(unitText);
  const prefixable = !logUnit && unitInfo?.prefixable === true;
  const safeValue = Object.is(value, -0) ? 0 : value;
  const safeStep = Number.isFinite(step) ? Math.abs(step) : 0;
  const prefix = prefixable
    ? chooseEngineeringPrefix(Math.max(Math.abs(safeValue), safeStep))
    : ENGINEERING_PREFIXES.find((candidate) => candidate.factor === 1)
      ?? { symbol: "", aliases: [""], factor: 1 };
  const outputUnit = unitInfo?.symbol ?? unitText;
  const currentIndex = ENGINEERING_PREFIXES.indexOf(prefix);
  let chosenPrefix = prefix;
  let formattedValue = safeValue / chosenPrefix.factor;
  let decimals = safeStep > 0 ? decimalsForStep(safeStep, chosenPrefix.factor) : 3;

  if (decimals === null) {
    return formatExponentialScalar(safeValue, outputUnit, chosenPrefix);
  }

  let rounded = formattedValue.toFixed(decimals);
  // Avoid rendering a rounded 1000 in a prefix that can be promoted.
  if (prefixable && Math.abs(Number(rounded)) >= 1000 && currentIndex > 0) {
    chosenPrefix = ENGINEERING_PREFIXES[currentIndex - 1] ?? chosenPrefix;
    formattedValue = safeValue / chosenPrefix.factor;
    decimals = safeStep > 0 ? decimalsForStep(safeStep, chosenPrefix.factor) : 3;
    if (decimals === null) return formatExponentialScalar(safeValue, outputUnit, chosenPrefix);
    rounded = formattedValue.toFixed(decimals);
  }

  if (Math.abs(formattedValue) >= 1e21) {
    return formatExponentialScalar(safeValue, outputUnit, chosenPrefix);
  }

  let numberText = trimZeroFraction(rounded);
  if (numberText === "-0") numberText = "0";
  else if (numberText.startsWith("-")) numberText = `−${numberText.slice(1)}`;
  if (unitInfo?.dimension === "frequency") numberText = groupFrequencyFraction(numberText);
  const suffix = `${chosenPrefix.symbol}${outputUnit}`;
  return suffix ? `${numberText} ${suffix}` : numberText;
}

export interface ParseEngInputOptions {
  /** Expected unprefixed unit for a bare prefix (for example, "Hz" or "s"). */
  readonly baseUnit?: string;
}

export type ParseEngInputFailureReason =
  | "empty"
  | "invalid-number"
  | "unknown-unit"
  | "missing-prefix-context"
  | "unit-mismatch"
  | "non-finite"
  | "overflow";

export type ParseEngInputResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: ParseEngInputFailureReason };

function baseUnitForContext(baseUnit: string): EngineeringUnit | undefined {
  const text = baseUnit.trim();
  return matchEngineeringUnit(text);
}

function validGroupedNumber(numberText: string): boolean {
  const exponentIndex = numberText.search(/[eE]/);
  const significand = exponentIndex < 0 ? numberText : numberText.slice(0, exponentIndex);
  if (exponentIndex >= 0 && /\s/.test(numberText.slice(exponentIndex))) return false;
  if (!/\s/.test(significand)) return true;

  const unsigned = significand.replace(/^[+-]/, "");
  const decimalIndex = unsigned.indexOf(".");
  const integerPart = decimalIndex < 0 ? unsigned : unsigned.slice(0, decimalIndex);
  const fractionPart = decimalIndex < 0 ? "" : unsigned.slice(decimalIndex + 1);
  const integerGroups = integerPart.split(/\s+/);
  const firstIntegerGroup = integerGroups[0] ?? "";
  if (integerGroups.length > 1
    && (firstIntegerGroup.length === 0
      || firstIntegerGroup.length > 3
      || integerGroups.slice(1).some((group) => group.length !== 3))) {
    return false;
  }

  if (/\s/.test(fractionPart)) {
    const fractionGroups = fractionPart.split(/\s+/);
    if (fractionGroups[0]?.length !== 3
      || fractionGroups.slice(1, -1).some((group) => group.length !== 3)
      || fractionGroups[fractionGroups.length - 1]?.length === 0
      || (fractionGroups[fractionGroups.length - 1]?.length ?? 0) > 3) {
      return false;
    }
  }
  return true;
}

function parseEngineeringSuffix(suffix: string): { unit: EngineeringUnit; factor: number } | undefined {
  const exact = matchEngineeringUnit(suffix);
  if (exact) return { unit: exact, factor: 1 };

  const prefixes = ENGINEERING_PREFIXES
    .flatMap((prefix) => prefix.aliases.filter(Boolean).map((alias) => ({ prefix, alias })))
    .sort((left, right) => right.alias.length - left.alias.length);

  for (const { prefix, alias } of prefixes) {
    if (!suffix.startsWith(alias)) continue;
    const baseText = suffix.slice(alias.length);
    if (!baseText) continue;
    const unit = matchEngineeringUnit(baseText);
    if (unit?.prefixable) return { unit, factor: prefix.factor };
  }
  return undefined;
}

/** Parse a finite engineering scalar and return its value in base units. */
export function parseEngInput(
  input: string,
  options: ParseEngInputOptions = {},
): ParseEngInputResult {
  const text = String(input ?? "").trim().replace(/\u2212/g, "-");
  if (!text) return { ok: false, reason: "empty" };
  if (/^[+-]?(?:nan|infinity)(?:\s*\S+)?$/i.test(text)) {
    return { ok: false, reason: "non-finite" };
  }

  // Permit space grouping in the fractional part so formatted frequency values
  // can be parsed back, while rejecting arbitrary embedded whitespace.
  const match = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s+\d{1,3})*(?:[eE][+-]?\d+)?)(?:\s*(\S+))?$/);
  if (!match) return { ok: false, reason: "invalid-number" };

  const groupedNumericText = match[1] ?? "";
  if (!validGroupedNumber(groupedNumericText)) return { ok: false, reason: "invalid-number" };
  const numericText = groupedNumericText.replace(/\s+/g, "");
  const numericValue = Number(numericText);
  if (Number.isNaN(numericValue)) {
    return { ok: false, reason: "invalid-number" };
  }
  if (!Number.isFinite(numericValue)) return { ok: false, reason: "non-finite" };
  if (numericValue === 0) {
    const mantissa = numericText.split(/[eE]/, 1)[0] ?? "0";
    if (/[1-9]/.test(mantissa)) return { ok: false, reason: "overflow" };
  }

  const suffix = match[2] ?? "";
  if (!suffix) return { ok: true, value: Object.is(numericValue, -0) ? 0 : numericValue };

  const parsedSuffix = parseEngineeringSuffix(suffix);
  if (parsedSuffix) {
    const expectedUnitText = options.baseUnit?.trim();
    if (expectedUnitText) {
      const expectedUnit = baseUnitForContext(expectedUnitText);
      if (!expectedUnit
        || expectedUnit.dimension !== parsedSuffix.unit.dimension
        || (expectedUnit.dimension === "log-level" && expectedUnit.symbol !== parsedSuffix.unit.symbol)) {
        return { ok: false, reason: "unit-mismatch" };
      }
    }
    const scaled = numericValue * parsedSuffix.factor;
    if (!Number.isFinite(scaled)) return { ok: false, reason: "overflow" };
    if (numericValue !== 0 && scaled === 0) return { ok: false, reason: "overflow" };
    return { ok: true, value: Object.is(scaled, -0) ? 0 : scaled };
  }

  const barePrefix = ENGINEERING_PREFIXES.find((prefix) => prefix.aliases.includes(suffix));
  if (barePrefix) {
    const expectedUnitText = options.baseUnit?.trim();
    if (!expectedUnitText) return { ok: false, reason: "missing-prefix-context" };
    const expectedUnit = baseUnitForContext(expectedUnitText);
    if (!expectedUnit?.prefixable) return { ok: false, reason: "unit-mismatch" };
    const scaled = numericValue * barePrefix.factor;
    if (!Number.isFinite(scaled)) return { ok: false, reason: "overflow" };
    if (numericValue !== 0 && scaled === 0) return { ok: false, reason: "overflow" };
    return { ok: true, value: Object.is(scaled, -0) ? 0 : scaled };
  }

  return { ok: false, reason: "unknown-unit" };
}

// ---------------------------------------------------------------------------
// Logarithmic unit classification
// ---------------------------------------------------------------------------

/** Whether the unit is a pure dB ratio (no reference). */
export function isDbRatioUnit(unit: string | null | undefined): boolean {
  return normalizeUnitName(unit) === "db";
}

/** Whether the unit is a logarithmic level (dB with a reference). */
export function isLogLevelUnit(unit: string | null | undefined): boolean {
  const u = normalizeUnitName(unit);
  return ["dbm", "dbw", "dbuv", "db\u00b5v", "db\u03bcv", "dbmv"].includes(u);
}

/** Whether the unit uses a logarithmic scale (dB-based). */
export function isLogUnit(unit: string | null | undefined): boolean {
  return isDbRatioUnit(unit) || isLogLevelUnit(unit);
}

// ---------------------------------------------------------------------------
// Physical dimension classification
// ---------------------------------------------------------------------------

const DIMENSION_MAP: ReadonlyMap<string, PhysicalDimension> = new Map([
  // Power
  ["dbm", "power"], ["dbw", "power"], ["w", "power"],
  // Voltage
  ["v", "voltage"], ["dbv", "voltage"], ["dbuv", "voltage"],
  ["db\u00b5v", "voltage"], ["db\u03bcv", "voltage"], ["dbmv", "voltage"],
  // Current
  ["a", "current"],
  // Impedance
  ["\u03a9", "impedance"], ["ohm", "impedance"], ["ohms", "impedance"],
  // Capacitance
  ["f", "capacitance"],
  // Inductance
  ["h", "inductance"],
  // Angle/phase
  ["degrees", "angle"], ["radians", "angle"], ["\u00b0", "angle"],
  // Ratio/dimensionless
  ["db", "ratio"], ["dbc", "ratio"], ["dbfs", "ratio"],
  ["vswr", "ratio"], ["unitless", "ratio"],
  // Spectral density
  ["dbm/hz", "spectral-density"], ["dbc/hz", "spectral-density"],
  ["v/\u221ahz", "spectral-density"], ["w/hz", "spectral-density"],
  ["v\u00b2/hz", "spectral-density"], ["a/\u221ahz", "spectral-density"],
  // Time
  ["s", "time"], ["ms", "time"], ["ns", "time"], ["ps", "time"], ["us", "time"],
  // Dimensionless
  ["%", "dimensionless"], ["linear(s)", "dimensionless"],
  ["db(s)", "ratio"],
]);

// ---------------------------------------------------------------------------
// UnitInfo lookup
// ---------------------------------------------------------------------------

/** Get full metadata for a unit string. */
export function getUnitInfo(unit: YUnit | string | null | undefined): UnitInfo {
  const norm = normalizeUnitName(unit);
  const dimension = DIMENSION_MAP.get(norm) ?? "dimensionless";
  const logarithmic = isLogUnit(unit);
  const canonical = (unit != null && String(unit).trim()) ? String(unit).trim() as YUnit : "Unitless" as YUnit;
  return { unit: canonical, logarithmic, dimension };
}

// ---------------------------------------------------------------------------
// Trace Y-unit accessors
// ---------------------------------------------------------------------------

/** Get the explicit Y unit from a trace. */
export function getTraceYUnit(tr: Trace | null | undefined): string {
  const unit = tr?.units?.y;
  return (typeof unit === "string" && unit.trim()) ? unit.trim() : "";
}

/** Get the effective Y unit (with fallback logic for derived traces). */
export function getEffectiveTraceYUnit(tr: Trace | null | undefined): string {
  const unit = getTraceYUnit(tr);
  if (unit) return unit;
  return "";
}

// ---------------------------------------------------------------------------
// Y-axis label generation
// ---------------------------------------------------------------------------

/** Build a Y-axis label string from a unit and optional trace context. */
export function getYAxisTextForUnit(
  unit: string | null | undefined,
  tr: Trace | null | undefined,
): string {
  const u = (unit ?? "").trim();
  const norm = normalizeUnitName(u);
  if (!u) return "Amplitude";
  if (norm === "dbm" || norm === "dbw") return `Power (${u})`;
  if (norm === "dbuv" || norm === "db\u00b5v" || norm === "db\u03bcv" || norm === "dbmv") return `Level (${u})`;
  if (norm === "db") {
    if (tr && tr.operationType === "subtract") return "Level Difference (dB)";
    return "Magnitude (dB)";
  }
  return `Amplitude (${u})`;
}

// ---------------------------------------------------------------------------
// Axis info derivation
// ---------------------------------------------------------------------------

/**
 * Derive axis labels and unit info from a set of visible traces.
 * Consolidates the logic from trace-model.js:140-176.
 */
export function deriveAxisInfo(
  allTr: readonly Trace[],
  vis: Readonly<Record<string, boolean>>,
  selectedTraceName: string | null,
  fUnit: string | null,
  hasData: boolean,
): AxisInfo {
  const visible = (allTr ?? []).filter(
    (tr) => vis[tr.name] && tr.data.length > 0,
  );

  const active = selectedTraceName
    ? (allTr ?? []).find((tr) => tr.name === selectedTraceName) ?? null
    : null;

  const target =
    active && visible.some((tr) => tr.name === active.name)
      ? active
      : visible[0] ?? null;

  // Collect distinct Y-units
  const unitsSeen: Record<string, string> = {};
  for (const tr of visible) {
    const u = getEffectiveTraceYUnit(tr);
    if (u) unitsSeen[normalizeUnitName(u)] = u;
  }
  const unitKeys = Object.keys(unitsSeen);

  let yUnit = target ? getEffectiveTraceYUnit(target) : "";
  let yLabel = "Amplitude";

  if (yUnit) {
    yLabel = getYAxisTextForUnit(yUnit, target);
  } else if (unitKeys.length === 1) {
    const firstKey = unitKeys[0];
    if (firstKey !== undefined) {
      yUnit = unitsSeen[firstKey] ?? "";
      yLabel = getYAxisTextForUnit(yUnit, target);
    }
  } else if (unitKeys.length > 1) {
    yUnit = "";
    yLabel = "Amplitude";
  }

  // Domain detection
  let xName = "Frequency";
  let domainType: "frequency" | "time" = "frequency";
  if (target && target.domain === "time") {
    xName = "Time";
    domainType = "time";
  }

  const xUnitStr = domainType === "time" ? "s" : (fUnit ?? "Hz");

  return {
    xLabel: `${xName} (${xUnitStr})`,
    yLabel: hasData ? yLabel : "",
    yUnit: yUnit ?? "",
    hasMixedYUnits: unitKeys.length > 1,
    axisDomain: domainType,
  };
}
