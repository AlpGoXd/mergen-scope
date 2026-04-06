// ============================================================================
// Mergen Scope — Unit System (Source of Truth)
// ============================================================================
// Every trace carries explicit unit metadata. Units are enforced at the type
// level (literal unions) and at runtime (domain/units.ts validators).
// ============================================================================

// ---------------------------------------------------------------------------
// Frequency-domain Y-axis units
// ---------------------------------------------------------------------------

/** Units valid for frequency-domain (spectrum analyzer) traces. */
export type FrequencyYUnit =
  | "dBm"       // Power relative to 1 mW
  | "dBV"       // Voltage relative to 1 V
  | "dBuV"      // Voltage relative to 1 µV
  | "dBFS"      // Full-scale digital
  | "dBc"       // Relative to carrier
  | "dB"        // Pure ratio (e.g. gain, attenuation)
  | "dBm/Hz"    // Spectral power density
  | "dBc/Hz"    // Phase noise density
  | "V/√Hz"     // Voltage spectral density
  | "A/√Hz"     // Current spectral density
  | "V²/Hz"     // Power spectral density (voltage-squared)
  | "W/Hz"      // Power spectral density (watts)
  | "Degrees"   // Phase
  | "Radians"   // Phase
  | "Unitless"; // Dimensionless quantity

// ---------------------------------------------------------------------------
// Time-domain Y-axis units
// ---------------------------------------------------------------------------

/** Units valid for time-domain (oscilloscope, transient) traces. */
export type TimeYUnit =
  | "V"         // Voltage
  | "A"         // Current
  | "C"         // Charge (coulombs)
  | "W"         // Power (watts)
  | "J"         // Energy (joules)
  | "VA"        // Apparent power
  | "VAR"       // Reactive power
  | "Ω"         // Impedance
  | "F"         // Capacitance (farads)
  | "H"         // Inductance (henrys)
  | "dB"        // Ratio
  | "dBm"       // Power level
  | "dBV"       // Voltage level
  | "°"         // Angle / phase
  | "%"         // Percentage
  | "Unitless"; // Dimensionless

// ---------------------------------------------------------------------------
// Network-domain Y-axis units (S-parameter views)
// ---------------------------------------------------------------------------

/**
 * Units for network-domain (Touchstone / S-parameter) traces.
 * These are derived per-view-type, not stored on the raw network file.
 */
export type NetworkYUnit =
  | "dB"          // S-parameter magnitude in dB
  | "dB (S)"      // Explicit: S-param magnitude in dB (for labeling clarity)
  | "linear (S)"  // S-parameter magnitude in linear scale
  | "Degrees"     // Phase
  | "Radians"     // Phase
  | "Unitless"    // Real/imaginary parts, reflection coefficient
  | "Ω"           // Impedance (from Z-parameters or Smith chart)
  | "ns"          // Group delay
  | "VSWR";       // Voltage standing wave ratio

// ---------------------------------------------------------------------------
// Combined Y-unit type
// ---------------------------------------------------------------------------

/** Any valid Y-axis unit across all domains. */
export type YUnit = FrequencyYUnit | TimeYUnit | NetworkYUnit;

// ---------------------------------------------------------------------------
// X-axis units
// ---------------------------------------------------------------------------

/** Frequency-axis units. */
export type FrequencyXUnit = "Hz" | "kHz" | "MHz" | "GHz";

/** Time-axis units. */
export type TimeXUnit = "s" | "ms" | "us" | "ns" | "ps";

/** Any valid X-axis unit. */
export type XUnit = FrequencyXUnit | TimeXUnit;

// ---------------------------------------------------------------------------
// Physical dimension (for compatibility checking)
// ---------------------------------------------------------------------------

/**
 * Classifies a unit by its physical dimension.
 * Used by `areUnitsCompatible()` to determine whether trace math
 * operations produce meaningful results.
 */
export type PhysicalDimension =
  | "power"             // W, dBm, dBW
  | "voltage"           // V, dBV, dBuV, dBmV
  | "current"           // A
  | "impedance"         // Ω
  | "capacitance"       // F
  | "inductance"        // H
  | "angle"             // Degrees, Radians, °
  | "ratio"             // dB, dBc, dBFS, VSWR, Unitless
  | "time"              // s, ms, ns (group delay)
  | "spectral-density"  // dBm/Hz, dBc/Hz, V/√Hz, W/Hz, V²/Hz, A/√Hz
  | "dimensionless";    // %, Unitless, linear (S)

// ---------------------------------------------------------------------------
// UnitInfo — metadata about a specific unit
// ---------------------------------------------------------------------------

/**
 * Complete metadata for a unit string.
 * Returned by `getUnitInfo()` in domain/units.ts.
 */
export interface UnitInfo {
  /** The canonical unit string. */
  readonly unit: YUnit;

  /** Whether this is a logarithmic (dB-based) unit. */
  readonly logarithmic: boolean;

  /** The physical dimension this unit measures. */
  readonly dimension: PhysicalDimension;
}

// ---------------------------------------------------------------------------
// Unit compatibility result
// ---------------------------------------------------------------------------

/**
 * Result of checking whether two units can participate in a trace math
 * operation. Returned by `areUnitsCompatible()` in domain/units.ts.
 */
export interface UnitCompatibilityResult {
  /** Whether the operation is physically meaningful. */
  readonly compatible: boolean;

  /**
   * Warning or informational message for the user.
   * Present when compatible is false (hard warning) or when the operation
   * is technically valid but the user should be aware (soft note).
   */
  readonly warning?: string;

  /**
   * The resulting Y-unit for the derived trace.
   * - Same-unit subtraction of log units → "dB"
   * - Same-unit division of linear units → "Unitless"
   * - Incompatible → "Unitless"
   * - null if either input unit is null
   */
  readonly resultUnit: YUnit | null;
}

// ---------------------------------------------------------------------------
// Axis info (derived from visible traces)
// ---------------------------------------------------------------------------

/**
 * Computed axis labeling information for a chart pane.
 * Returned by `deriveAxisInfo()` in domain/units.ts.
 */
export interface AxisInfo {
  /** X-axis label including unit, e.g. "Frequency (MHz)". */
  readonly xLabel: string;

  /** Y-axis label, e.g. "Power (dBm)" or "Amplitude" if mixed units. */
  readonly yLabel: string;

  /** The common Y-unit of visible traces, or empty string if mixed. */
  readonly yUnit: string;

  /** True when visible traces have different Y-units. */
  readonly hasMixedYUnits: boolean;

  /** The X-axis domain type for this pane. */
  readonly axisDomain: "frequency" | "time";
}
