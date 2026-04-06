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
  UnitCompatibilityResult,
  AxisInfo,
} from "../types/units.ts";
import type { OperationType, Trace } from "../types/trace.ts";

// ---------------------------------------------------------------------------
// Unit normalization
// ---------------------------------------------------------------------------

/** Normalize a unit string: trim, lowercase, collapse whitespace. */
export function normalizeUnitName(unit: string | null | undefined): string {
  return String(unit ?? "").trim().toLowerCase().replace(/\s+/g, "");
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
// Unit compatibility (NEW consolidated function)
// ---------------------------------------------------------------------------

/**
 * Check whether two units can participate in a binary trace math operation.
 * Consolidates `resolveTraceMathResultUnit` + `getTraceMathUnitWarning`.
 */
export function areUnitsCompatible(
  aUnit: YUnit | string | null,
  bUnit: YUnit | string | null,
  op: OperationType,
): UnitCompatibilityResult {
  const aNorm = normalizeUnitName(aUnit);
  const bNorm = normalizeUnitName(bUnit);

  // If either unit is unknown, allow but can't determine result unit
  if (!aNorm || !bNorm) {
    return {
      compatible: true,
      resultUnit: (aUnit ?? bUnit ?? null) as YUnit | null,
      warning: "One or both traces have no unit metadata.",
    };
  }

  const aInfo = getUnitInfo(aUnit);
  const bInfo = getUnitInfo(bUnit);

  // Same normalized unit
  if (aNorm === bNorm) {
    if (op === "subtract") {
      // Same-unit subtraction of log units → dB
      if (aInfo.logarithmic) {
        return { compatible: true, resultUnit: "dB" as YUnit };
      }
      return { compatible: true, resultUnit: aInfo.unit };
    }
    if (op === "divide") {
      return { compatible: true, resultUnit: "Unitless" as YUnit };
    }
    return { compatible: true, resultUnit: aInfo.unit };
  }

  // Same dimension, different specific unit
  if (aInfo.dimension === bInfo.dimension) {
    if (op === "subtract" || op === "divide") {
      return {
        compatible: true,
        resultUnit: op === "subtract" ? "dB" as YUnit : "Unitless" as YUnit,
        warning: `Different units (${String(aUnit)}, ${String(bUnit)}) in the same dimension — result may need interpretation.`,
      };
    }
    return {
      compatible: true,
      resultUnit: aInfo.unit,
      warning: `Mixed units: ${String(aUnit)} and ${String(bUnit)}.`,
    };
  }

  // Different dimensions
  return {
    compatible: false,
    resultUnit: "Unitless" as YUnit,
    warning: `Incompatible units: ${String(aUnit)} (${aInfo.dimension}) and ${String(bUnit)} (${bInfo.dimension}).`,
  };
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
  if (tr && tr.kind === "derived" && tr.operationType === "subtract") return "dB";
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
