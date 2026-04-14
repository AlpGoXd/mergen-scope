// ============================================================================
// Mergen Scope — Formatting Functions
// ============================================================================
// Ported from: app-modules/ui-helpers.js (185 lines)
// Pure domain functions only — no React, no DOM.
// ============================================================================

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSecondUnit(unit: string | null | undefined): boolean {
  const key = String(unit ?? "").trim().toLowerCase();
  return key === "s" || key === "sec" || key === "secs" || key === "second" || key === "seconds";
}

function isSiemensUnit(unit: string | null | undefined): boolean {
  const raw = String(unit ?? "").trim();
  const key = raw.toLowerCase();
  return raw === "S" || key === "siemens";
}

function isOhmUnit(unit: string | null | undefined): boolean {
  const key = String(unit ?? "").trim().toLowerCase();
  return key === "ohm" || key === "ohms" || key === "omega";
}

function trimFixedNumber(text: string): string {
  let s = String(text ?? "");
  if (s.indexOf(".") === -1) return s;
  s = s.replace(/(\.[0-9]*?)0+$/, "$1");
  s = s.replace(/\.$/, "");
  return s;
}

// ---------------------------------------------------------------------------
// Engineering prefix table
// ---------------------------------------------------------------------------

interface PrefixEntry {
  readonly factor: number;
  readonly prefix: string;
}

const PREFIX_TABLE: readonly PrefixEntry[] = [
  { factor: 1e12, prefix: "T" },
  { factor: 1e9, prefix: "G" },
  { factor: 1e6, prefix: "M" },
  { factor: 1e3, prefix: "k" },
  { factor: 1, prefix: "" },
  { factor: 1e-3, prefix: "m" },
  { factor: 1e-6, prefix: "u" },
  { factor: 1e-9, prefix: "n" },
  { factor: 1e-12, prefix: "p" },
];

function choosePrefixEntry(referenceValue: number): PrefixEntry {
  const absVal = Math.abs(referenceValue);
  let choice = PREFIX_TABLE[PREFIX_TABLE.length - 1]!;
  for (const entry of PREFIX_TABLE) {
    if (absVal >= entry.factor) {
      choice = entry;
      break;
    }
  }
  return choice;
}

function clampDecimals(value: number): number {
  return Math.max(1, Math.min(9, value));
}

export function getAdaptiveDecimalsForSpan(
  visibleSpan: number,
  scaleFactor = 1,
): number {
  const scaledSpan = Math.abs(visibleSpan) / Math.max(Math.abs(scaleFactor), 1e-30);
  if (!Number.isFinite(scaledSpan) || scaledSpan <= 0) {
    return 3;
  }
  return clampDecimals(-Math.floor(Math.log10(scaledSpan)) + 3);
}

export function formatAdaptiveEngineeringValue(
  value: number,
  baseUnit: string,
  visibleSpan: number,
): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";

  const reference = Math.max(Math.abs(n), Math.abs(visibleSpan), 1e-12);
  const choice = choosePrefixEntry(reference);
  const digits = getAdaptiveDecimalsForSpan(visibleSpan, choice.factor);
  const scaled = n / choice.factor;
  return `${trimFixedNumber(scaled.toFixed(digits))} ${choice.prefix}${baseUnit}`;
}

function formatFixedEngineeringValue(
  value: number,
  factor: number,
  digits: number,
  suffix: string,
): string {
  const scaled = value / factor;
  return `${scaled.toFixed(digits)}${suffix}`;
}

function hasAdjacentDuplicateLabels(labels: readonly string[]): boolean {
  for (let index = 1; index < labels.length; index += 1) {
    if (labels[index] === labels[index - 1]) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Frequency formatting
// ---------------------------------------------------------------------------

/** Format a frequency value in Hz with automatic SI prefix. */
export function fmtF(hz: number): string {
  if (typeof hz !== "number" || !Number.isFinite(hz)) return "--";
  const a = Math.abs(hz);
  if (a >= 1e9) return `${(hz / 1e9).toFixed(6)} GHz`;
  if (a >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
  if (a >= 1e3) return `${(hz / 1e3).toFixed(3)} kHz`;
  return `${hz.toFixed(1)} Hz`;
}

// ---------------------------------------------------------------------------
// Engineering value formatting
// ---------------------------------------------------------------------------

/** Format a value using engineering notation (SI prefixes). */
export function formatEngineeringValue(
  value: number,
  baseUnit: string,
  digits: number,
): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  if (n === 0) return `0 ${baseUnit}`;

  const choice = choosePrefixEntry(n);

  const scaled = n / choice.factor;
  const txt = trimFixedNumber(scaled.toFixed(digits));
  return `${txt} ${choice.prefix}${baseUnit}`;
}

// ---------------------------------------------------------------------------
// Scalar with unit formatting
// ---------------------------------------------------------------------------

/** Options for formatScalarWithUnit. */
export interface FormatScalarOptions {
  readonly digits?: number;
  readonly valueOnly?: boolean;
  readonly disableEngineering?: boolean;
  readonly preferredUnit?: string;
}

/** Format a scalar value with its unit, auto-selecting SI prefixes for time/impedance. */
export function formatScalarWithUnit(
  value: number,
  unit: string | null | undefined,
  opts?: FormatScalarOptions,
): string {
  const options = opts ?? {};
  const n = Number(value);
  const unitText = String(unit ?? "").trim();
  const digits = Number.isFinite(Number(options.digits))
    ? Math.max(0, Math.floor(Number(options.digits)))
    : 3;

  if (!Number.isFinite(n)) return "--";

  // Siemens / Ohm → engineering notation
  if (!options.disableEngineering && (isSiemensUnit(unitText) || isOhmUnit(unitText))) {
    const base = isSiemensUnit(unitText) ? "S" : "Ohm";
    const eng = formatEngineeringValue(n, base, digits);
    if (options.valueOnly) return eng.split(" ")[0] ?? eng;
    return eng;
  }

  // Seconds → auto-scaled time units
  if (isSecondUnit(unitText) && !options.disableEngineering) {
    const absVal = Math.abs(n);
    const preferred = String(options.preferredUnit ?? "").trim().toLowerCase();
    let factor = 1;
    let displayUnit = "s";
    let displayDigits = 6;

    if (["ms", "us", "ns", "ps", "s"].includes(preferred)) {
      displayUnit = preferred;
      factor = displayUnit === "ms" ? 1e3
        : displayUnit === "us" ? 1e6
        : displayUnit === "ns" ? 1e9
        : displayUnit === "ps" ? 1e12
        : 1;
      displayDigits = displayUnit === "s" ? 6 : 3;
    } else {
      if (absVal >= 1e-3 && absVal < 1) { factor = 1e3; displayUnit = "ms"; displayDigits = 3; }
      else if (absVal >= 1e-6 && absVal < 1e-3) { factor = 1e6; displayUnit = "us"; displayDigits = 3; }
      else if (absVal >= 1e-9 && absVal < 1e-6) { factor = 1e9; displayUnit = "ns"; displayDigits = 3; }
      else if (absVal > 0 && absVal < 1e-9) { factor = 1e12; displayUnit = "ps"; displayDigits = 3; }
    }

    const scaled = (n * factor).toFixed(displayDigits);
    return options.valueOnly ? scaled : `${scaled} ${displayUnit}`;
  }

  // Default numeric formatting
  const base = n.toFixed(digits);
  if (options.valueOnly) return base;
  return unitText ? `${base} ${unitText}` : base;
}

export function formatAdaptiveXAxisValue(
  value: number,
  visibleSpan: number,
  options?: {
    readonly domain?: "frequency" | "time" | null;
    readonly unit?: string | null;
  },
): string {
  const domain = options?.domain ?? null;
  const unit = options?.unit ?? null;

  if (domain === "frequency") {
    return formatAdaptiveEngineeringValue(value, "Hz", visibleSpan);
  }

  if (domain === "time" || isSecondUnit(unit)) {
    return formatAdaptiveEngineeringValue(value, "s", visibleSpan);
  }

  return formatScalarWithUnit(value, unit, { digits: 3 });
}

export function formatAdaptiveXAxisTickLabels(
  values: readonly number[],
  visibleSpan: number,
  options?: {
    readonly domain?: "frequency" | "time" | null;
    readonly unit?: string | null;
  },
): string[] {
  const domain = options?.domain ?? null;
  const unit = options?.unit ?? null;
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return values.map(() => "--");
  }

  if (domain !== "frequency" && domain !== "time" && !isSecondUnit(unit)) {
    return values.map((value) => formatScalarWithUnit(value, unit, { digits: 3 }));
  }

  const baseUnit = domain === "time" || isSecondUnit(unit) ? "s" : "Hz";
  const reference = finiteValues.reduce((max, value) => Math.max(max, Math.abs(value)), Math.abs(visibleSpan));
  const choice = choosePrefixEntry(Math.max(reference, 1e-12));
  const suffix = baseUnit === "Hz"
    ? choice.prefix
    : `${choice.prefix}${baseUnit}`;

  let digits = getAdaptiveDecimalsForSpan(visibleSpan, choice.factor);
  let labels = finiteValues.map((value) => formatFixedEngineeringValue(value, choice.factor, digits, suffix));

  while (digits < 9 && hasAdjacentDuplicateLabels(labels)) {
    digits += 1;
    labels = finiteValues.map((value) => formatFixedEngineeringValue(value, choice.factor, digits, suffix));
  }

  let cursor = 0;
  return values.map((value) => {
    if (!Number.isFinite(value)) return "--";
    const label = labels[cursor];
    cursor += 1;
    return label ?? "--";
  });
}
