/**
 * Copy as LaTeX: a ready-to-paste pgfplots figure of one chart pane (axes, grid, legend below, print-safe styles,
 * marker pins, reference lines, trace colours as named \definecolor's). Pure: the caller supplies the plotted
 * ranges and labels (from the export render), the trace data and colours as sRGB.
 */
import type { DataPoint } from '../types/trace';
import type { TraceSymbol } from './trace-palette';
import { decimateMinMax } from './trace-math';

export interface Rgb { readonly r: number; readonly g: number; readonly b: number }

export interface LatexTrace {
  readonly name: string;
  readonly color: Rgb;
  readonly symbol: TraceSymbol | null;
  readonly data: readonly DataPoint[];
}

export interface LatexFigureInput {
  readonly paneName: string;
  readonly date: Date;
  /** Plotted ranges, as drawn by the export render. */
  readonly x: { readonly min: number; readonly max: number; readonly label: string; readonly unit: string | null };
  readonly y: { readonly min: number; readonly max: number; readonly label: string };
  readonly traces: readonly LatexTrace[];
  readonly markers: readonly { readonly label: string; readonly x: number; readonly y: number; readonly trace: number }[];
  readonly lines: readonly { readonly type: 'v' | 'h'; readonly value: number; readonly label: string }[];
}

/** Points per trace in the figure (min/max decimated, so peaks survive). */
export const LATEX_MAX_POINTS = 300;

/** pgfplots marks in the app's symbol order: ○ □ △ ◇ ▽ + × ☆. */
const MARKS: Readonly<Record<TraceSymbol, string>> = {
  circle: 'mark=o', square: 'mark=square', triangle: 'mark=triangle', diamond: 'mark=diamond',
  'triangle-down': 'mark=triangle, mark options={rotate=180, solid}', plus: 'mark=+', cross: 'mark=x', star: 'mark=star',
};
/** Print-safe dashes, by symbol: solid ○, dashed □, dotted △, then repeating. */
const DASHES = ['solid', 'dashed', 'dotted'] as const;

const PREFIXES: readonly (readonly [number, string])[] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, '\\textmu{}'], [1e-9, 'n'], [1e-12, 'p']];

/** The engineering prefix for an axis that spans up to `maxAbs` units. */
export function axisPrefix(maxAbs: number): { factor: number; prefix: string } {
  if (!Number.isFinite(maxAbs) || maxAbs === 0) return { factor: 1, prefix: '' };
  const found = PREFIXES.find(([factor]) => maxAbs >= factor);
  const [factor, prefix] = found ?? PREFIXES[PREFIXES.length - 1] ?? [1, ''];
  return { factor, prefix };
}

const SPECIALS: Readonly<Record<string, string>> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '^': '\\textasciicircum{}',
  _: '\\_', '%': '\\%', '~': '\\textasciitilde{}', '|': '\\textbar{}', '<': '\\textless{}', '>': '\\textgreater{}',
  'µ': '\\textmu{}', 'Δ': '$\\Delta$', 'Ω': '$\\Omega$', '–': '--', '—': '---', '·': '$\\cdot$', '…': '\\dots{}',
};

/** Text made safe for LaTeX (names come from user files). */
export function latexEscape(text: string): string {
  return [...text].map(ch => SPECIALS[ch] ?? ch).join('');
}

/** Number text pgfplots reads: up to 6 significant digits, no locale, exponent kept. */
export function latexNumber(value: number): string {
  if (!Number.isFinite(value)) return 'nan';
  if (value === 0) return '0';
  const text = Number(value.toPrecision(6)).toString();
  return text.includes('e') ? text.replace('e+', 'e') : text;
}

/** "Frequency (Hz)" with the axis in GHz → "Frequency (GHz)"; a label without the unit gets it appended. */
export function scaledAxisLabel(label: string, unit: string | null, prefix: string): string {
  if (!unit) return latexEscape(label);
  const scaled = `${prefix}${latexEscape(unit)}`;
  const suffix = `(${unit})`;
  if (label.trimEnd().endsWith(suffix)) return `${latexEscape(label.trimEnd().slice(0, -suffix.length))}(${scaled})`;
  return prefix ? `${latexEscape(label)} (${scaled})` : latexEscape(label);
}

function colorName(index: number): string {
  // Letters only: \definecolor names cannot hold digits safely in every package combination.
  let n = index, name = '';
  do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `msTrace${name}`;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The figure as LaTeX source: `figure` with caption and label, `\columnwidth` wide, data inline. */
export function latexFigure(input: LatexFigureInput): string {
  const { x, y } = input;
  const { factor, prefix } = axisPrefix(Math.max(Math.abs(x.min), Math.abs(x.max)));
  const sx = (value: number) => latexNumber(value / factor);
  const day = `${input.date.getFullYear()}-${pad2(input.date.getMonth() + 1)}-${pad2(input.date.getDate())}`;
  const out: string[] = [];
  out.push(`% Mergen Scope: ${input.paneName.replace(/[\r\n]+/g, ' ')}, ${day}`);
  out.push('% Preamble: \\usepackage{pgfplots} \\pgfplotsset{compat=1.18}');
  input.traces.forEach((trace, index) => {
    const c = trace.color;
    out.push(`\\definecolor{${colorName(index)}}{RGB}{${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}}`);
  });
  out.push('\\begin{figure}[t]', '  \\centering', '  \\begin{tikzpicture}', '    \\begin{axis}[');
  out.push(
    '      width=\\columnwidth, height=0.62\\columnwidth,',
    `      xmin=${sx(x.min)}, xmax=${sx(x.max)}, ymin=${latexNumber(y.min)}, ymax=${latexNumber(y.max)},`,
    `      xlabel={${scaledAxisLabel(x.label, x.unit, prefix)}}, ylabel={${latexEscape(y.label)}},`,
    '      grid=major, grid style={gray!30, line width=0.4pt}, axis line style={black},',
    '      tick label style={font=\\footnotesize}, label style={font=\\footnotesize},',
    '      scaled ticks=false, clip=true,',
    '      every axis plot/.append style={line width=0.75pt, mark size=2.5pt},',
    '      legend style={at={(0.5,-0.2)}, anchor=north, draw=none, font=\\footnotesize, cells={anchor=west}},',
    '      legend columns=1, legend cell align=left,',
    '    ]',
  );
  input.traces.forEach((trace, index) => {
    const points = decimateMinMax(trace.data, x.min, x.max, LATEX_MAX_POINTS / 2).filter(point => Number.isFinite(point.freq) && Number.isFinite(point.amp));
    const symbolIndex = trace.symbol ? Math.max(0, ['circle', 'square', 'triangle', 'diamond', 'triangle-down', 'plus', 'cross', 'star'].indexOf(trace.symbol)) : index;
    const dash = DASHES[symbolIndex % DASHES.length] ?? 'solid';
    // About eight marks per trace, offset per trace so marks of different traces do not stack.
    const repeat = Math.max(1, Math.round(points.length / 8));
    const phase = 1 + Math.round((index * repeat) / Math.max(1, input.traces.length)) % repeat;
    const mark = trace.symbol ? `${MARKS[trace.symbol]}, mark repeat=${repeat}, mark phase=${phase}` : 'mark=none';
    const markSolid = trace.symbol && trace.symbol !== 'triangle-down' ? ', mark options={solid}' : '';
    out.push(`      \\addplot[color=${colorName(index)}, ${dash}, ${mark}${markSolid}] coordinates {`);
    for (let i = 0; i < points.length; i += 6) {
      out.push(`        ${points.slice(i, i + 6).map(point => `(${sx(point.freq)},${latexNumber(point.amp)})`).join(' ')}`);
    }
    out.push('      };', `      \\addlegendentry{${latexEscape(trace.name)}}`);
  });
  for (const line of input.lines) {
    const label = latexEscape(line.label);
    if (line.type === 'v') {
      if (line.value < x.min || line.value > x.max) continue;
      out.push(`      \\draw[gray, dashed, line width=0.5pt] (axis cs:${sx(line.value)},${latexNumber(y.min)}) -- (axis cs:${sx(line.value)},${latexNumber(y.max)}) node[pos=0.98, anchor=north west, font=\\scriptsize, text=black] {${label}};`);
    } else {
      if (line.value < y.min || line.value > y.max) continue;
      out.push(`      \\draw[gray, dashed, line width=0.5pt] (axis cs:${sx(x.min)},${latexNumber(line.value)}) -- (axis cs:${sx(x.max)},${latexNumber(line.value)}) node[pos=0.02, anchor=south west, font=\\scriptsize, text=black] {${label}};`);
    }
  }
  for (const marker of input.markers) {
    if (marker.x < x.min || marker.x > x.max || marker.y < y.min || marker.y > y.max) continue;
    out.push(`      \\node[circle, fill=${colorName(marker.trace)}, draw=black, inner sep=1.2pt, pin={[font=\\scriptsize, pin distance=7pt, pin edge={black, thin}]90:{${latexEscape(marker.label)}}}] at (axis cs:${sx(marker.x)},${latexNumber(marker.y)}) {};`);
  }
  out.push('    \\end{axis}', '  \\end{tikzpicture}');
  out.push(`  \\caption{${latexEscape(input.paneName)}.}`);
  out.push(`  \\label{fig:${input.paneName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pane'}}`);
  out.push('\\end{figure}', '');
  return out.join('\n');
}
