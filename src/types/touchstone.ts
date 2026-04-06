// ============================================================================
// Mergen Scope — Touchstone / Network Type Definitions
// ============================================================================
// Ported from: app-modules/touchstone-math-helpers.js shapes
// ============================================================================

// ---------------------------------------------------------------------------
// Complex number
// ---------------------------------------------------------------------------

/** A complex number in rectangular form. */
export interface Complex {
  readonly re: number;
  readonly im: number;
}

// ---------------------------------------------------------------------------
// Complex matrix types
// ---------------------------------------------------------------------------

/** A row of complex numbers in a matrix. */
export type ComplexRow = readonly Complex[];

/** A square complex matrix (N×N). */
export type ComplexMatrix = readonly ComplexRow[];

// ---------------------------------------------------------------------------
// Matrix format
// ---------------------------------------------------------------------------

/** Touchstone matrix storage format. */
export type MatrixFormat = "full" | "upper" | "lower";

// ---------------------------------------------------------------------------
// Matrix order entry
// ---------------------------------------------------------------------------

/** A single row/col index pair from the matrix traversal order. */
export interface MatrixOrderEntry {
  readonly row: number;
  readonly col: number;
}

// ---------------------------------------------------------------------------
// Touchstone data format
// ---------------------------------------------------------------------------

/** How complex values are stored in a Touchstone file. */
export type TouchstoneDataFormat = "MA" | "DB" | "RI";

// ---------------------------------------------------------------------------
// Touchstone parameter type
// ---------------------------------------------------------------------------

/** The network parameter type. Only S is supported in v1. */
export type TouchstoneParameterType = "S" | "Y" | "Z" | "G" | "H";

// ---------------------------------------------------------------------------
// Touchstone sample (one frequency point)
// ---------------------------------------------------------------------------

/** A single frequency sample from a Touchstone file, containing the full S-matrix. */
export interface TouchstoneSample {
  /** Frequency in Hz (after unit scaling). */
  readonly freq: number;

  /** The S-parameter matrix at this frequency. */
  readonly sMatrix: ComplexMatrix;
}

// ---------------------------------------------------------------------------
// Touchstone network (full file-level data)
// ---------------------------------------------------------------------------

/** Complete parsed data from a Touchstone file. */
export interface TouchstoneNetwork {
  /** Network parameter type (currently only "S" supported). */
  readonly parameterType: TouchstoneParameterType;

  /** Number of ports (1, 2, 3, …). */
  readonly portCount: number;

  /** Reference impedance per port in Ohms. */
  readonly referenceOhms: readonly number[];

  /** Frequency unit from the option line. */
  readonly freqUnit: string;

  /** Data format from the option line. */
  readonly dataFormat: TouchstoneDataFormat;

  /** Comment lines extracted from "!" lines. */
  readonly comments: readonly string[];

  /** All frequency samples with their S-matrices. */
  readonly samples: readonly TouchstoneSample[];

  /** Matrix format (full/upper/lower) — Touchstone v2. */
  readonly matrixFormat: MatrixFormat;

  /** Touchstone version (1 or 2). */
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Network source (per-trace metadata linking back to Touchstone file)
// ---------------------------------------------------------------------------

/** Metadata linking a trace back to its source S-parameter cell. */
export interface NetworkSource {
  /** ID of the parent parsed file record. */
  readonly parentFileId?: string | number | null;

  /** S-parameter family: "S", "Y", "Z". */
  readonly family?: string;

  /** View mode: "dB", "Phase", "Real", "Imag", "VSWR", etc. */
  readonly view?: string;

  /** Matrix row index (0-based). */
  readonly row?: number;

  /** Matrix column index (0-based). */
  readonly col?: number;

  /** Derived scalar metric name (e.g. "K", "mu1", "GroupDelay"). */
  readonly metric?: string;

  /** Port count from the parent network. */
  readonly portCount?: number;

  /** Reference impedance from the parent network. */
  readonly referenceOhms?: number | readonly number[];

  /** Parameter type from the parent network. */
  readonly parameterType?: string;

  /** File name of the parent Touchstone file. */
  readonly fileName?: string;

  /** Frequency unit from the parent network. */
  readonly freqUnit?: string;

  /** Data format from the parent network. */
  readonly dataFormat?: string;
}

// ---------------------------------------------------------------------------
// Touchstone UI selection state
// ---------------------------------------------------------------------------

/** S-parameter family: S, Y, or Z. */
export type TouchstoneFamily = "S" | "Y" | "Z";

/** S-parameter view mode: dB, Mag, Phase, Real, Imag. */
export type TouchstoneView = "dB" | "Mag" | "Phase" | "Real" | "Imag";

/** Container for Touchstone parameter selections for a file. */
export interface TouchstoneSelectionState {
  /** The currently active family tab (S, Y, Z). */
  readonly activeFamily: TouchstoneFamily;

  /** Whether the Touchstone control panel is expanded. */
  readonly isExpanded: boolean;

  /** The active view mode for each family tab. */
  readonly activeViewByFamily: Record<TouchstoneFamily, TouchstoneView>;

  /** 
   * Selected cells per family. 
   * Key: "row:col" (1-based). 
   * Value: Array of active view modes.
   */
  readonly selectedCellsByFamily: Record<TouchstoneFamily, Record<string, TouchstoneView[]>>;
}

// ---------------------------------------------------------------------------
// Two-port stability result
// ---------------------------------------------------------------------------

/** Result of computing two-port stability factors. */
export interface StabilityResult {
  /** Determinant of the S-matrix (Δ). */
  readonly delta: Complex;

  /** |Δ| — magnitude of the determinant. */
  readonly deltaAbs: number;

  /** Rollett stability factor (K). */
  readonly kFactor: number;

  /** Edwards–Sinsky stability factor μ₁. */
  readonly mu1: number;

  /** Edwards–Sinsky stability factor μ₂. */
  readonly mu2: number;

  /** True when K > 1 and |Δ| < 1 (unconditionally stable). */
  readonly unconditional: boolean;
}
