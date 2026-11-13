// ============================================================================
// Mergen Scope — Touchstone Math Functions
// ============================================================================
// Ported from: app-modules/touchstone-math-helpers.js:60+
// Matrix operations, S→Z/Y conversions, stability analysis.
// ============================================================================

import type {
  Complex,
  ComplexMatrix,

  MatrixFormat,
  MatrixOrderEntry,
  TouchstoneDataFormat,
  StabilityResult,
} from "../types/touchstone.ts";
import { cx, cloneComplex, add, sub, mul, div, conj, abs, abs2, fromPolar, fromDbAngle } from "./complex.ts";

// ---------------------------------------------------------------------------
// Matrix format helpers
// ---------------------------------------------------------------------------

/** Normalize a matrix format string to "full", "upper", or "lower". */
export function normalizeMatrixFormat(matrixFormat: string | null | undefined): MatrixFormat {
  const fmt = String(matrixFormat ?? "full").trim().toLowerCase();
  if (fmt === "lower" || fmt === "upper" || fmt === "full") return fmt;
  return "full";
}

/** Build the traversal order for a matrix based on format and port count. */
export function buildMatrixOrder(portCount: number, matrixFormat: MatrixFormat): MatrixOrderEntry[] {
  const n = Math.max(1, Math.floor(Number(portCount) || 0));
  const fmt = normalizeMatrixFormat(matrixFormat);
  const order: MatrixOrderEntry[] = [];

  if (fmt === "lower") {
    for (let col = 0; col < n; col++) {
      for (let row = col; row < n; row++) order.push({ row, col });
    }
    return order;
  }
  if (fmt === "upper") {
    for (let col = 0; col < n; col++) {
      for (let row = 0; row <= col; row++) order.push({ row, col });
    }
    return order;
  }
  for (let col = 0; col < n; col++) {
    for (let row = 0; row < n; row++) order.push({ row, col });
  }
  return order;
}

// ---------------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------------

/** Create an N×N zero matrix. */
export function makeComplexMatrix(portCount: number): Complex[][] {
  const n = Math.max(1, Math.floor(Number(portCount) || 0));
  const matrix: Complex[][] = [];
  for (let row = 0; row < n; row++) {
    const line: Complex[] = [];
    for (let col = 0; col < n; col++) line.push(cx(0, 0));
    matrix.push(line);
  }
  return matrix;
}

/** Deep-clone a complex matrix. */
export function cloneComplexMatrix(matrix: ComplexMatrix): Complex[][] {
  return (Array.isArray(matrix) ? matrix : []).map((row) =>
    (Array.isArray(row) ? row : []).map(cloneComplex),
  );
}

/** Create an N×N identity matrix. */
export function matrixIdentity(portCount: number): Complex[][] {
  const n = Math.max(1, Math.floor(Number(portCount) || 0));
  const matrix = makeComplexMatrix(n);
  for (let i = 0; i < n; i++) matrix[i]![i] = cx(1, 0);
  return matrix;
}

// ---------------------------------------------------------------------------
// Matrix arithmetic
// ---------------------------------------------------------------------------

/** Add two complex matrices element-wise. */
export function matrixAdd(a: ComplexMatrix, b: ComplexMatrix): Complex[][] {
  const n = a?.length ?? 0;
  const out = makeComplexMatrix(n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      out[row]![col] = add(a[row]![col]!, b[row]![col]!);
    }
  }
  return out;
}

/** Subtract matrix b from matrix a element-wise. */
export function matrixSubtract(a: ComplexMatrix, b: ComplexMatrix): Complex[][] {
  const n = a?.length ?? 0;
  const out = makeComplexMatrix(n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      out[row]![col] = sub(a[row]![col]!, b[row]![col]!);
    }
  }
  return out;
}

/** Multiply two complex matrices. */
export function matrixMultiply(a: ComplexMatrix, b: ComplexMatrix): Complex[][] {
  const n = a?.length ?? 0;
  const out = makeComplexMatrix(n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      let sum = cx(0, 0);
      for (let k = 0; k < n; k++) {
        sum = add(sum, mul(a[row]![k]!, b[k]![col]!));
      }
      out[row]![col] = sum;
    }
  }
  return out;
}

/** Invert a complex matrix using Gauss-Jordan elimination. Returns null on failure. */
export function matrixInverse(matrix: ComplexMatrix): Complex[][] | null {
  const n = matrix?.length ?? 0;
  if (!n) return null;

  // Build augmented matrix [A | I]
  const aug: Complex[][] = [];
  for (let row = 0; row < n; row++) {
    const line: Complex[] = [];
    for (let col = 0; col < n; col++) line.push(cloneComplex(matrix[row]![col]!));
    for (let j = 0; j < n; j++) line.push(j === row ? cx(1, 0) : cx(0, 0));
    aug.push(line);
  }

  for (let pivotCol = 0; pivotCol < n; pivotCol++) {
    let pivotRow = pivotCol;
    let pivotMag = abs(aug[pivotRow]![pivotCol]!);
    for (let row2 = pivotCol + 1; row2 < n; row2++) {
      const mag = abs(aug[row2]![pivotCol]!);
      if (mag > pivotMag) { pivotMag = mag; pivotRow = row2; }
    }
    if (!Number.isFinite(pivotMag) || pivotMag <= 1e-15) return null;
    if (pivotRow !== pivotCol) {
      const tmp = aug[pivotCol]!;
      aug[pivotCol] = aug[pivotRow]!;
      aug[pivotRow] = tmp;
    }
    const pivot = aug[pivotCol]![pivotCol]!;
    for (let col2 = 0; col2 < 2 * n; col2++) {
      const normalized = div(aug[pivotCol]![col2]!, pivot);
      if (normalized === null) return null;
      aug[pivotCol]![col2] = normalized;
    }
    for (let row3 = 0; row3 < n; row3++) {
      if (row3 === pivotCol) continue;
      const factor = aug[row3]![pivotCol]!;
      if (abs(factor) <= 1e-15) {
        aug[row3]![pivotCol] = cx(0, 0);
        continue;
      }
      for (let col3 = 0; col3 < 2 * n; col3++) {
        aug[row3]![col3] = sub(aug[row3]![col3]!, mul(factor, aug[pivotCol]![col3]!));
      }
    }
  }

  const inverse: Complex[][] = [];
  for (let row4 = 0; row4 < n; row4++) {
    inverse.push(aug[row4]!.slice(n, 2 * n).map(cloneComplex));
  }
  return inverse;
}

// ---------------------------------------------------------------------------
// Reference impedance helpers
// ---------------------------------------------------------------------------

/** Normalize reference impedance to an array of per-port values. */
export function normalizeReferenceArray(
  referenceOhms: number | readonly number[] | null | undefined,
  portCount: number,
): number[] | null {
  const hasPortCount = portCount != null && Number.isFinite(Number(portCount)) && Number(portCount) > 0;
  const n = hasPortCount ? Math.max(1, Math.floor(Number(portCount) || 0)) : 0;

  if (Array.isArray(referenceOhms)) {
    const refs = referenceOhms.map(Number);
    if (!refs.length) return null;
    for (const ref of refs) {
      if (!Number.isFinite(ref) || ref <= 0) return null;
    }
    if (hasPortCount && refs.length === 1) {
      return Array.from({ length: n }, () => refs[0]!);
    }
    if (hasPortCount && refs.length !== n) return null;
    return refs;
  }

  const scalar = Number(referenceOhms);
  if (!Number.isFinite(scalar) || scalar <= 0) return null;
  if (!hasPortCount) return [scalar];
  return Array.from({ length: n }, () => scalar);
}

// ---------------------------------------------------------------------------
// Matrix expansion
// ---------------------------------------------------------------------------

/** Expand ordered complex values into a full N×N matrix. */
export function expandOrderedValuesToMatrix(
  portCount: number,
  matrixFormat: MatrixFormat,
  values: readonly Complex[],
): Complex[][] | null {
  const n = Math.max(1, Math.floor(Number(portCount) || 0));
  const order = buildMatrixOrder(n, matrixFormat);
  if (!Array.isArray(values) || values.length !== order.length) return null;

  const matrix = makeComplexMatrix(n);
  for (let i = 0; i < order.length; i++) {
    const entry = order[i]!;
    const value = cloneComplex(values[i]!);
    matrix[entry.row]![entry.col] = value;
    if (matrixFormat !== "full" && entry.row !== entry.col) {
      matrix[entry.col]![entry.row] = cloneComplex(value);
    }
  }
  return matrix;
}

/** Convert a Touchstone data pair to a complex number based on format. */
export function touchstonePairToComplex(
  dataFormat: TouchstoneDataFormat,
  a: number,
  b: number,
): Complex {
  const fmt = String(dataFormat ?? "MA").trim().toUpperCase();
  if (fmt === "RI") return cx(a, b);
  if (fmt === "DB") return fromDbAngle(a, b);
  return fromPolar(a, b);
}

// ---------------------------------------------------------------------------
// S → Z / Y conversions
// ---------------------------------------------------------------------------

/** Convert an S-matrix to a Z-matrix. */
export function convertSMatrixToZMatrix(
  sMatrix: ComplexMatrix,
  referenceOhms: number | readonly number[],
): Complex[][] | null {
  const n = sMatrix?.length ?? 0;
  if (!n) return null;
  const refs = normalizeReferenceArray(referenceOhms, n);
  if (!refs) return null;

  const identity = matrixIdentity(n);
  const plus = matrixAdd(identity, sMatrix);
  const minus = matrixSubtract(identity, sMatrix);
  const minusInv = matrixInverse(minus);
  if (!minusInv) return null;

  const left = makeComplexMatrix(n);
  for (let i = 0; i < n; i++) {
    left[i]![i] = cx(Math.sqrt(refs[i]!), 0);
  }

  return matrixMultiply(matrixMultiply(left, matrixMultiply(plus, minusInv)), left);
}

/** Convert an S-matrix to a Y-matrix. */
export function convertSMatrixToYMatrix(
  sMatrix: ComplexMatrix,
  referenceOhms: number | readonly number[],
): Complex[][] | null {
  const n = sMatrix?.length ?? 0;
  if (!n) return null;
  const refs = normalizeReferenceArray(referenceOhms, n);
  if (!refs) return null;

  const identity = matrixIdentity(n);
  const minus = matrixSubtract(identity, sMatrix);
  const plus = matrixAdd(identity, sMatrix);
  const plusInv = matrixInverse(plus);
  if (!plusInv) return null;

  const invLeft = makeComplexMatrix(n);
  for (let i = 0; i < n; i++) {
    invLeft[i]![i] = cx(1 / Math.sqrt(refs[i]!), 0);
  }

  return matrixMultiply(matrixMultiply(invLeft, matrixMultiply(minus, plusInv)), invLeft);
}

// ---------------------------------------------------------------------------
// Stability analysis (2-port)
// ---------------------------------------------------------------------------

/** Compute two-port stability factors (K, μ₁, μ₂). */
export function computeTwoPortStability(sMatrix: ComplexMatrix): StabilityResult | null {
  if (!Array.isArray(sMatrix) || sMatrix.length !== 2) return null;
  if (!Array.isArray(sMatrix[0]) || !Array.isArray(sMatrix[1])) return null;

  const s11 = sMatrix[0]![0] ?? cx(0, 0);
  const s12 = sMatrix[0]![1] ?? cx(0, 0);
  const s21 = sMatrix[1]![0] ?? cx(0, 0);
  const s22 = sMatrix[1]![1] ?? cx(0, 0);

  const delta = sub(mul(s11, s22), mul(s12, s21));
  const deltaAbs = abs(delta);
  const s12s21 = mul(s12, s21);
  const s12s21Abs = abs(s12s21);

  const kNumerator = 1 - abs2(s11) - abs2(s22) + deltaAbs * deltaAbs;
  const kDenominator = 2 * s12s21Abs;
  const kFactor = kDenominator === 0
    ? (kNumerator >= 0 ? Infinity : -Infinity)
    : kNumerator / kDenominator;

  const deltaConj = conj(delta);
  const mu1Numerator = 1 - abs2(s11);
  const mu1Denominator = abs(sub(s22, mul(deltaConj, s11))) + s12s21Abs;
  const mu1 = mu1Denominator === 0
    ? (mu1Numerator >= 0 ? Infinity : -Infinity)
    : mu1Numerator / mu1Denominator;

  const mu2Numerator = 1 - abs2(s22);
  const mu2Denominator = abs(sub(s11, mul(deltaConj, s22))) + s12s21Abs;
  const mu2 = mu2Denominator === 0
    ? (mu2Numerator >= 0 ? Infinity : -Infinity)
    : mu2Numerator / mu2Denominator;

  return {
    delta,
    deltaAbs,
    kFactor,
    mu1,
    mu2,
    unconditional: !!(kFactor > 1 && deltaAbs < 1),
  };
}

// ---------------------------------------------------------------------------
// File base name
// ---------------------------------------------------------------------------

/** Extract base name from a Touchstone file name. */
export function getTouchstoneFileBaseName(fileName: string | null | undefined): string {
  const name = String(fileName ?? "").replace(/^.*[\\/]/, "");
  return name.replace(/\.[^.]+$/, "") || name || "touchstone";
}

/** Build a Touchstone trace label. */
export function buildTouchstoneTraceLabel(
  fileName: string,
  family: string,
  row: number | null,
  col: number | null,
  view: string,
): string {
  const base = getTouchstoneFileBaseName(fileName);
  const cell =
    String(family ?? "").toUpperCase() +
    (Number.isFinite(row) ? String(row) : "") +
    (Number.isFinite(col) ? String(col) : "");
  const suffix = String(view ?? "").trim();
  return [base, cell, suffix]
    .filter((part) => !!String(part).trim())
    .join(" ");
}
