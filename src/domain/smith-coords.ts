/**
 * Utility for Smith Chart coordinate transformations.
 * Ported from legacy smithCoord and mirrorSmithCoord in app-chart-components.js.
 */

/**
 * Maps a value from -1..1 range (normalized Smith) to 0..100 (SVG viewBox).
 * @param v Normalized coordinate component (-1 to 1)
 * @returns SVG coordinate (0 to 100)
 */
export function smithCoord(v: number): number {
  return 50 + 42 * v;
}

/**
 * Handles mirroring for inverted Smith charts.
 * @param v SVG coordinate (0 to 100)
 * @param mode 'smith' or 'smith-inverted'
 * @returns Mirrored SVG coordinate
 */
export function mirrorSmithCoord(v: number, mode: 'smith' | 'smith-inverted'): number {
  if (mode !== 'smith-inverted') return v;
  return 100 - v;
}

/**
 * Converts a complex number (Gamma) to SVG points.
 * @param real Real part of reflection coefficient
 * @param imag Imaginary part of reflection coefficient
 * @returns {x, y} in 0..100 scale
 */
export function gammaToSvg(real: number, imag: number): { x: number; y: number } {
  return {
    x: smithCoord(real),
    y: smithCoord(-imag) // SVG y-axis is inverted
  };
}
