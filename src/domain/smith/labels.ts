import type { Complex } from '../../types/touchstone.ts';
import type { SmithPoint, SmithViewport } from '../../types/smith-plot.ts';
import { pointOnArc, reactanceArc, reactanceRimPoint, rotateArc180 } from './grid.ts';
import type { SmithGridKind } from './grid.ts';
import { gammaToPoint } from './viewport.ts';

export type SmithLabelMode = 'normalised' | 'ohms';
export interface SmithLabel {
  readonly key: string;
  readonly text: string;
  /** Centre of the text box in screen pixels. Labels are never rotated. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 'r' = constant-r (or g) circle, 'x' = constant-x (or b) arc, 'end' = the "0" and "∞" axis ends. */
  readonly kind: 'r' | 'x' | 'end';
  /** Normalised grid value; signed for reactance. */
  readonly value: number;
}

const MINUS = '−';

function trimNumber(value: number): string {
  const a = Math.abs(value);
  if (a === 0) return '0';
  const text = a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/**
 * Label text. Normalised by default ("0.5", "+j0.5"; never "0.5j" or "i"). The ohms mode multiplies
 * by Z0 ("25 Ω", "+j25 Ω"); the Y grid uses millisiemens ("10 mS", "+j10 mS").
 */
export function formatGridLabel(kind: 'r' | 'x', value: number, grid: SmithGridKind, mode: SmithLabelMode, z0: number): string {
  const physical = mode === 'ohms' && Number.isFinite(z0) && z0 > 0;
  const scaled = !physical ? value : grid === 'y' ? (value * 1000) / z0 : value * z0;
  const unit = !physical ? '' : grid === 'y' ? ' mS' : ' Ω';
  if (kind === 'r') return `${trimNumber(scaled)}${unit}`;
  return `${value < 0 ? MINUS : '+'}j${trimNumber(scaled)}${unit}`;
}

export interface SmithLabelOptions {
  readonly grid: SmithGridKind;
  /** Positive grid values that are drawn (the same set for r and |x|). */
  readonly values: readonly number[];
  readonly viewport: SmithViewport;
  readonly mode: SmithLabelMode;
  readonly z0: number;
  /** Font size in px of the mono label face; box sizes are estimated from it. */
  readonly fontPx: number;
}

const GAP_PX = 5;

function boxOf(text: string, fontPx: number): { width: number; height: number } {
  return { width: Math.max(1, text.length) * fontPx * 0.62 + 2, height: fontPx * 1.25 };
}
function overlaps(a: SmithLabel, b: SmithLabel): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 1;
}
function fits(x: number, y: number, width: number, height: number, v: SmithViewport): boolean {
  return x - width / 2 >= 0 && x + width / 2 <= v.width && y - height / 2 >= 0 && y + height / 2 <= v.height;
}

/** A label outside the rim: its box is pushed out along the radius so it never touches the circle. */
function outsideRim(rim: Complex, width: number, height: number, v: SmithViewport): SmithPoint | null {
  const p = gammaToPoint(rim, v);
  if (!p) return null;
  const length = Math.hypot(rim.re, rim.im) || 1;
  const ux = rim.re / length, uy = -rim.im / length;
  const reach = GAP_PX + (Math.abs(ux) * width) / 2 + (Math.abs(uy) * height) / 2;
  return { x: p.x + ux * reach, y: p.y + uy * reach };
}

/**
 * Positions and text of the grid labels, after overlap removal.
 * - Resistance values sit on the real axis, just above it, at each circle's edge.
 * - Reactance values sit outside the rim at the end of each arc (+j in the top half of the Z grid).
 *   When that spot is off screen the label moves to where its arc enters the view.
 * - "0" and "∞" mark the two ends of the axis.
 * - On overlap the label of the smaller value is dropped first.
 */
export function buildLabels(options: SmithLabelOptions): SmithLabel[] {
  const { grid, values, viewport: v, mode, z0, fontPx } = options;
  const flip = grid === 'y' ? -1 : 1;
  const candidates: SmithLabel[] = [];

  // Axis ends. On the Y grid, g = 0 is the open end (Γ = +1).
  for (const end of [{ text: '0', re: -1 * flip, value: 0 }, { text: '∞', re: 1 * flip, value: Infinity }]) {
    const box = boxOf(end.text, fontPx);
    const at = outsideRim({ re: end.re, im: 0 }, box.width, box.height, v);
    if (at && fits(at.x, at.y, box.width, box.height, v)) candidates.push({ key: `end:${end.text}`, text: end.text, x: at.x, y: at.y, ...box, kind: 'end', value: end.value });
  }

  const sorted = [...values].filter(value => Number.isFinite(value) && value > 0).sort((a, b) => b - a);
  for (const value of sorted) {
    // Constant-r circle: where it crosses the real axis on the far side from Γ = 1.
    const edge = gammaToPoint({ re: ((value - 1) / (value + 1)) * flip, im: 0 }, v);
    const rText = formatGridLabel('r', value, grid, mode, z0);
    const rBox = boxOf(rText, fontPx);
    if (edge) {
      const x = edge.x + flip * (3 + rBox.width / 2), y = edge.y - 2 - rBox.height / 2;
      if (fits(x, y, rBox.width, rBox.height, v)) candidates.push({ key: `r:${value}`, text: rText, x, y, ...rBox, kind: 'r', value });
    }

    for (const signedValue of [value, -value]) {
      const text = formatGridLabel('x', signedValue, grid, mode, z0);
      const box = boxOf(text, fontPx);
      const rim = reactanceRimPoint(signedValue);
      const at = outsideRim({ re: rim.re * flip, im: rim.im * flip }, box.width, box.height, v);
      if (at && fits(at.x, at.y, box.width, box.height, v)) {
        candidates.push({ key: `x:${signedValue}`, text, x: at.x, y: at.y, ...box, kind: 'x', value: signedValue });
        continue;
      }
      // Rim off screen: walk the arc from the rim toward Γ = ±1 and stop where the label first fits.
      const baseArc = reactanceArc(signedValue);
      if (!baseArc) continue;
      const arc = grid === 'y' ? rotateArc180(baseArc) : baseArc;
      const steps = 96;
      for (let i = 1; i < steps; i++) {
        const p = gammaToPoint(pointOnArc(arc, i / steps), v);
        if (p && fits(p.x, p.y, box.width + 2 * GAP_PX, box.height + 2 * GAP_PX, v)) {
          candidates.push({ key: `x:${signedValue}`, text, x: p.x, y: p.y, ...box, kind: 'x', value: signedValue });
          break;
        }
      }
    }
  }

  // Ends first, then the larger values: on overlap the smaller value's label goes.
  const kept: SmithLabel[] = [];
  for (const label of candidates) {
    if (!kept.some(other => overlaps(label, other))) kept.push(label);
  }
  return kept;
}
