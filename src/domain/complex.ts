// ============================================================================
// Mergen Scope — Complex Number Arithmetic
// ============================================================================
// Ported from: app-modules/touchstone-math-helpers.js:1-60
// Pure functions, zero side effects.
// ============================================================================

import type { Complex } from "../types/touchstone.ts";

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a complex number, clamping non-finite values to 0. */
export function cx(re: number, im: number): Complex {
  return {
    re: Number.isFinite(re) ? Number(re) : 0,
    im: Number.isFinite(im) ? Number(im) : 0,
  };
}

/** Clone a complex number (or return 0+0i for nullish input). */
export function cloneComplex(z: Complex | null | undefined): Complex {
  return cx(z?.re ?? 0, z?.im ?? 0);
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/** Add two complex numbers. */
export function add(a: Complex | null, b: Complex | null): Complex {
  return cx((a?.re ?? 0) + (b?.re ?? 0), (a?.im ?? 0) + (b?.im ?? 0));
}

/** Subtract b from a. */
export function sub(a: Complex | null, b: Complex | null): Complex {
  return cx((a?.re ?? 0) - (b?.re ?? 0), (a?.im ?? 0) - (b?.im ?? 0));
}

/** Multiply two complex numbers. */
export function mul(a: Complex | null, b: Complex | null): Complex {
  const ar = a?.re ?? 0;
  const ai = a?.im ?? 0;
  const br = b?.re ?? 0;
  const bi = b?.im ?? 0;
  return cx(ar * br - ai * bi, ar * bi + ai * br);
}

/** Divide a by b. Returns null if the denominator is zero. */
export function div(a: Complex | null, b: Complex | null): Complex | null {
  const ar = a?.re ?? 0;
  const ai = a?.im ?? 0;
  const br = b?.re ?? 0;
  const bi = b?.im ?? 0;
  const denom = br * br + bi * bi;
  if (!Number.isFinite(denom) || denom === 0) return null;
  return cx((ar * br + ai * bi) / denom, (ai * br - ar * bi) / denom);
}

/** Complex conjugate. */
export function conj(a: Complex | null): Complex {
  return cx(a?.re ?? 0, -(a?.im ?? 0));
}

// ---------------------------------------------------------------------------
// Magnitude
// ---------------------------------------------------------------------------

/** Magnitude (absolute value) of a complex number. */
export function abs(a: Complex | null): number {
  return Math.hypot(a?.re ?? 0, a?.im ?? 0);
}

/** Squared magnitude of a complex number. */
export function abs2(a: Complex | null): number {
  const re = a?.re ?? 0;
  const im = a?.im ?? 0;
  return re * re + im * im;
}

// ---------------------------------------------------------------------------
// Polar / dB constructors
// ---------------------------------------------------------------------------

/** Create a complex number from polar magnitude and angle (degrees). */
export function fromPolar(magnitude: number, angleDeg: number): Complex {
  const mag = Number.isFinite(magnitude) ? Number(magnitude) : 0;
  const theta = (Number.isFinite(angleDeg) ? Number(angleDeg) : 0) * Math.PI / 180;
  return cx(mag * Math.cos(theta), mag * Math.sin(theta));
}

/** Create a complex number from dB magnitude and angle (degrees). */
export function fromDbAngle(db: number, angleDeg: number): Complex {
  let mag = Math.pow(10, Number(db) / 20);
  if (!Number.isFinite(mag)) mag = 0;
  return fromPolar(mag, angleDeg);
}
