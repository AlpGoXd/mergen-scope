/**
 * Copy as LaTeX: a ready-to-paste pgfplots figure of one chart pane (axes, grid, legend below, print-safe styles,
 * marker pins, reference lines, trace colours as named \definecolor's). Pure: the caller supplies the plotted
 * ranges and labels (from the export render), the trace data and colours as sRGB.
 */
import type { DataPoint } from '../types/trace';
import type { TraceSymbol } from './trace-palette';
import { decimateMinMax } from './trace-math';
import { buildGrid, gridValues, pointOnArc, pointOnCircle, UNIT_CIRCLE } from './smith/grid';
import type { SmithCircle } from './smith/grid';
import { DEFAULT_LATEX_OPTIONS } from './export-document';
import type { LatexOptions } from './export-document';
import { exportGroupLayout, exportTick } from './export-plot';
import type { ExportAxis } from './export-plot';
import type { PresetId } from './pane-layout';
import { logTickLabel, logTicks } from './chart/axis-scale';

export interface Rgb { readonly r: number; readonly g: number; readonly b: number }

export interface LatexTrace {
  readonly name: string;
  readonly color: Rgb;
  readonly symbol: TraceSymbol | null;
  readonly data: readonly DataPoint[];
  readonly runs?: readonly (readonly DataPoint[])[];
}

export interface LatexFigureInput {
  readonly paneName: string;
  readonly date: Date;
  /** Plotted ranges, as drawn by the export render. */
  readonly x: LatexAxis & { readonly unit: string | null };
  readonly y: LatexAxis;
  readonly traces: readonly LatexTrace[];
  readonly markers: readonly { readonly label: string; readonly x: number; readonly y: number; readonly trace: number; readonly shift?: { x: number; y: number } | null }[];
  readonly lines: readonly { readonly type: 'v' | 'h'; readonly value: number; readonly label: string }[];
  readonly smithGrid?: 'z' | 'y' | 'both';
  readonly grid?: boolean;
  readonly legend?: 'below' | 'inside' | 'off';
  readonly caption?: boolean;
  readonly markerTags?: boolean;
  readonly linePt?: number;
  readonly textPt?: number;
}
interface LatexAxis { readonly min: number; readonly max: number; readonly label: string; readonly scale?: ExportAxis; readonly ticks?: readonly number[]; readonly logarithmic?: boolean }

/** Points per trace in the figure (min/max decimated, so peaks survive). */
export const LATEX_MAX_POINTS = 2000;

/** pgfplots marks in the app's symbol order: ○ □ △ ◇ ▽ + × ☆. */
const MARKS: Readonly<Record<TraceSymbol, string>> = {
  circle: 'mark=o', square: 'mark=square', triangle: 'mark=triangle', diamond: 'mark=diamond',
  'triangle-down': 'mark=triangle, mark options={rotate=180, solid}', plus: 'mark=+', cross: 'mark=x', star: 'mark=star',
};

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
  'µ': '\\textmu{}', 'Δ': '$\\Delta$', 'Ω': '$\\Omega$', '−': '$-$', '–': '--', '—': '---', '·': '$\\cdot$', '…': '\\dots{}',
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
  return latexDocument(input).source;
}

export interface LatexDocument {
  readonly source: string;
  readonly files: readonly { name: string; text: string }[];
  readonly axis?: { colors: string[]; options: string[]; body: string[] };
}

function traceColor(trace: LatexTrace, options: LatexOptions): Rgb {
  if (options.colors === 'trace') return trace.color;
  const { r, g, b } = trace.color;
  const tone = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return { r: tone, g: tone, b: tone };
}

export function latexDocument(input: LatexFigureInput, options = DEFAULT_LATEX_OPTIONS, filePrefix = 'pane', size?: { width: number; height: number }): LatexDocument {
  const { x, y } = input;
  const { factor, prefix } = input.smithGrid || x.logarithmic ? { factor: 1, prefix: '' } : axisPrefix(Math.max(Math.abs(x.min), Math.abs(x.max)));
  const sx = (value: number) => x.logarithmic ? String(value) : latexNumber((value - (x.scale?.offset ?? 0)) / (x.scale?.factor ?? factor));
  const sy = (value: number) => y.logarithmic ? String(value) : latexNumber((value - (y.scale?.offset ?? 0)) / (y.scale?.factor ?? 1));
  const name = (index: number) => colorName(index) + (size ? filePrefix.replace(/\d/g, digit => String.fromCharCode(65 + Number(digit))).replace(/[^a-z]/gi, '') : '');
  const tickOptions = (key: 'x' | 'y', axis: LatexAxis, scale: (value: number) => string) => {
    if (axis.logarithmic) {
      const ticks = logTicks(axis);
      const labels = ticks.filter(tick => tick.label);
      return [`      ${key}mode=log, log basis ${key}=10,`,
        `      ${key}tick={${labels.map(tick => tick.value).join(',')}},`,
        `      ${key}ticklabels={${labels.map(tick => latexEscape(logTickLabel(tick.value))).join(',')}},`,
        `      minor ${key}tick={${ticks.filter(tick => !tick.label).map(tick => tick.value).join(',')}},`];
    }
    if (!axis.scale || !axis.ticks?.length) return [];
    return [`      ${key}tick={${axis.ticks.map(scale).join(',')}},`, `      ${key}ticklabels={${axis.ticks.map(value => exportTick(axis.scale!, value)).join(',')}},`];
  };
  const width = latexWidth(options, size?.width);
  const wrapped = options.wrap === 'figure';
  const figure = options.width === 'two-column' ? 'figure*' : 'figure';
  const files: { name: string; text: string }[] = [];
  const day = `${input.date.getFullYear()}-${pad2(input.date.getMonth() + 1)}-${pad2(input.date.getDate())}`;
  const out: string[] = [];
  out.push(`% Mergen Scope: ${input.paneName.replace(/[\r\n]+/g, ' ')}, ${day}`);
  out.push('% Preamble: \\usepackage{pgfplots} \\pgfplotsset{compat=1.18}');
  const colors = input.traces.map((trace, index) => {
    const c = traceColor(trace, options);
    return `\\definecolor{${name(index)}}{RGB}{${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}}`;
  });
  out.push(...colors);
  if (wrapped) out.push(`\\begin{${figure}}[t]`, '  \\centering');
  out.push('  \\begin{tikzpicture}', '    \\begin{axis}[');
  const textFont = input.textPt ? `\\fontsize{${input.textPt}}{${input.textPt + 2}}\\selectfont` : '\\footnotesize';
  const axisOptions = [
    `      width=${width}, height=${input.smithGrid ? width : latexWidth(options, size?.height ?? 0.62)},`,
    `      xmin=${sx(x.min)}, xmax=${sx(x.max)}, ymin=${sy(y.min)}, ymax=${sy(y.max)},`,
    `      xlabel={${x.scale ? latexEscape(x.label) : scaledAxisLabel(x.label, x.unit, prefix)}}, ylabel={${latexEscape(y.label)}},`,
    ...tickOptions('x', x, sx), ...tickOptions('y', y, sy),
    input.smithGrid ? '      hide axis, axis equal image,' : `      grid=${input.grid === false ? 'none' : 'major'}, grid style={gray!30, line width=0.4pt}, axis line style={black},`,
    ...(!input.smithGrid && input.grid !== false && (x.logarithmic || y.logarithmic) ? [
      x.logarithmic ? '      minor x grid=true,' : '',
      y.logarithmic ? '      minor y grid=true,' : '',
      '      minor grid style={gray!20, solid, line width=0.4pt},',
    ].filter(Boolean) : []),
    `      tick label style={font=${textFont}}, label style={font=${textFont}},`,
    '      scaled ticks=false, tick align=inside, clip=true,',
    `      every axis plot/.append style={line width=${input.linePt ?? 0.75}pt, mark size=2.5pt},`,
    input.legend === 'inside' ? '      legend pos=north east,' : '      legend style={at={(0.5,0)}, yshift=-32pt, anchor=north, draw=none, font=\\scriptsize, cells={anchor=west}},',
    '      legend columns=1, legend cell align=left,',
  ];
  out.push(...axisOptions, '    ]');
  const bodyStart = out.length;
  if (input.smithGrid) addSmithGrid(out, input.smithGrid, input.grid !== false);
  input.traces.forEach((trace, index) => {
    const logarithmic = x.logarithmic || y.logarithmic;
    const points = trace.runs ? smithPoints(trace.runs, options.points) : cartesianPoints(trace.data, x.min, x.max, logarithmic ? 'all' : options.points);
    // About eight marks per trace, offset per trace so marks of different traces do not stack.
    const repeat = Math.max(1, Math.round(points.length / 8));
    const phase = 1 + Math.round((index * repeat) / Math.max(1, input.traces.length)) % repeat;
    const mark = trace.symbol ? `${MARKS[trace.symbol]}, mark repeat=${repeat}, mark phase=${phase}` : 'mark=none';
    const markSolid = trace.symbol && trace.symbol !== 'triangle-down' ? ', mark options={solid}' : '';
    const plot = `      \\addplot[color=${name(index)}, solid, ${mark}${markSolid}${trace.runs || logarithmic ? ', unbounded coords=jump' : ''}]`;
    const coords = points.map(point => x.logarithmic && point.freq <= 0 || y.logarithmic && point.amp <= 0
      ? ['nan', 'nan'] as const : [sx(point.freq), sy(point.amp)] as const);
    if (options.data === 'zip') {
      const name = `${filePrefix}-trace-${index + 1}.dat`;
      files.push({ name, text: ['x y', ...coords.map(([a, b]) => `${a} ${b}`)].join('\n') + '\n' });
      out.push(`${plot} table[x=x,y=y] {${name}};`);
    } else {
      out.push(plot + ' coordinates {');
      for (let i = 0; i < coords.length; i += 6) {
        out.push('        ' + coords.slice(i, i + 6).map(([a, b]) => `(${a},${b})`).join(' '));
      }
      out.push('      };');
    }
    if (input.legend !== 'off') out.push(`      \\addlegendentry{${latexEscape(trace.name)}}`);
  });
  for (const line of input.lines) {
    const label = latexEscape(line.label);
    if (line.type === 'v') {
      if (line.value < x.min || line.value > x.max) continue;
      out.push(`      \\draw[gray, dashed, line width=0.5pt] (axis cs:${sx(line.value)},${sy(y.min)}) -- (axis cs:${sx(line.value)},${sy(y.max)}) node[pos=0.98, anchor=north west, font=\\scriptsize, text=black] {${label}};`);
    } else {
      if (line.value < y.min || line.value > y.max) continue;
      out.push(`      \\draw[gray, dashed, line width=0.5pt] (axis cs:${sx(x.min)},${sy(line.value)}) -- (axis cs:${sx(x.max)},${sy(line.value)}) node[pos=0.02, anchor=south west, font=\\scriptsize, text=black] {${label}};`);
    }
  }
  const showMarkerTags = input.markerTags !== false;
  for (const [index, marker] of input.markers.entries()) {
    if (marker.x < x.min || marker.x > x.max || marker.y < y.min || marker.y > y.max) continue;
    const point = `(axis cs:${sx(marker.x)},${sy(marker.y)})`;
    if (!showMarkerTags) {
      out.push(`      \\node[circle, fill=${name(marker.trace)}, draw=black, inner sep=1.2pt] at ${point} {};`);
    } else if (marker.shift === undefined) {
      out.push(`      \\node[circle, fill=${name(marker.trace)}, draw=black, inner sep=1.2pt, pin={[font=\\scriptsize, pin distance=7pt, pin edge={black, thin}]90:{${latexEscape(marker.label)}}}] at ${point} {};`);
    } else {
      if (marker.shift) {
        const tag = `msTag${filePrefix}-${index + 1}`;
        out.push(`      \\node[font=\\scriptsize,inner sep=0pt,outer sep=1pt] (${tag}) at ([xshift=${latexNumber(marker.shift.x)}pt,yshift=${latexNumber(marker.shift.y)}pt]axis cs:${sx(marker.x)},${sy(marker.y)}) {${latexEscape(marker.label)}};`);
        out.push(`      \\draw[black!45,line width=0.45pt] ${point} -- (${tag});`);
      }
      out.push(`      \\node[circle, fill=${name(marker.trace)}, draw=black, inner sep=1.2pt] at ${point} {};`);
    }
  }
  const body = out.slice(bodyStart);
  out.push('    \\end{axis}');
  if (!wrapped && input.caption === true) out.push(`\\node[anchor=south] at (current bounding box.north) {${latexEscape(input.paneName)}};`);
  out.push('  \\end{tikzpicture}');
  if (wrapped) {
    if (input.caption !== false) {
      out.push(`  \\caption{${latexEscape(input.paneName)}.}`);
      out.push(`  \\label{fig:${input.paneName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pane'}}`);
    }
    out.push(`\\end{${figure}}`);
  }
  return { source: [...out, ''].join('\n'), files, axis: { colors, options: axisOptions, body } };
}

function latexWidth(options: LatexOptions, multiplier = 1): string {
  if (options.width === 'fixed') return latexNumber(options.widthMm * multiplier) + 'mm';
  return (multiplier === 1 ? '' : latexNumber(multiplier)) + (options.width === 'column' ? '\\columnwidth' : options.width === 'two-column' ? '\\textwidth' : '\\linewidth');
}

/** A spanning main pane uses a separate axis beside the right-column group. */
export function latexPaneLayout(
  panes: readonly (LatexDocument | null)[],
  options: LatexOptions,
  caption: string,
  preset: PresetId,
): LatexDocument {
  const layout = exportGroupLayout(preset, panes.length);
  const lines = ['% Mergen Scope', '% Preamble: \\usepackage{pgfplots} \\usepgfplotslibrary{groupplots} \\pgfplotsset{compat=1.18}'];
  const wrapped = options.wrap === 'figure';
  const figure = options.width === 'two-column' ? 'figure*' : 'figure';
  if (wrapped) lines.push(`\\begin{${figure}}[t]`, '\\centering');
  lines.push('\\begin{tikzpicture}', ...panes.flatMap(document => document?.axis?.colors ?? []));
  const left = layout.separateMain ? panes[0]?.axis : undefined;
  const skipWidth = latexWidth(options, 0.54);
  if (left) {
    lines.push('\\begin{axis}[anchor=north west,at={(0pt,0pt)},', ...left.options, ']', ...left.body, '\\end{axis}');
  }
  if (layout.separateMain) lines.push(`\\begin{scope}[xshift=${skipWidth}]`);
  lines.push(`\\begin{groupplot}[group style={group size=${layout.columns} by ${layout.rows}, horizontal sep=${latexWidth(options, 0.11)}, vertical sep=${latexWidth(options, 0.24)}}, anchor=north west]`);
  const dimensions = panes.slice(Number(layout.separateMain)).find(document => document?.axis)?.axis?.options[0]?.trim() ?? '';
  for (let i = 0; i < layout.columns * layout.rows; i++) {
    const axis = panes[i + Number(layout.separateMain)]?.axis;
    if (axis) lines.push('\\nextgroupplot[', ...axis.options, ']', ...axis.body);
    else lines.push(`\\nextgroupplot[group/empty plot,${dimensions}xmin=0,xmax=1,ymin=0,ymax=1]`);
  }
  lines.push('\\end{groupplot}');
  if (layout.separateMain) lines.push('\\end{scope}');
  if (!wrapped && caption) lines.push(`\\node[anchor=south] at (current bounding box.north) {${latexEscape(caption)}};`);
  lines.push('\\end{tikzpicture}');
  if (wrapped) {
    if (caption) lines.push(`\\caption{${latexEscape(caption)}.}`);
    lines.push(`\\end{${figure}}`);
  }
  return { source: [...lines, ''].join('\n'), files: panes.flatMap(document => document?.files ?? []) };
}

export function latexMarkerTable(document: LatexDocument, options: LatexOptions, rows: readonly string[]): string {
  if (!rows.length) return document.source;
  const notes = rows.map(latexEscape).join('\\\\\n');
  const markerTable = [
    '\\node[anchor=north west,align=left] at (current bounding box.south west) {%',
    `\\parbox{${latexWidth(options, 0.92)}}{\\scriptsize`,
    notes, '}};',
  ].join('\n');
  const index = document.source.lastIndexOf('\\end{tikzpicture}');
  return document.source.slice(0, index) + markerTable + '\n' + document.source.slice(index);
}

function cartesianPoints(data: readonly DataPoint[], min: number, max: number, points: LatexOptions['points']) {
  const inRange = data.filter(point => point.freq >= min && point.freq <= max);
  const visible = points === 'all' || inRange.length <= LATEX_MAX_POINTS ? inRange : decimateMinMax(inRange, min, max, LATEX_MAX_POINTS / 2);
  return visible.filter(point => Number.isFinite(point.freq) && Number.isFinite(point.amp));
}

function smithPoints(runs: readonly (readonly DataPoint[])[], points: LatexOptions['points']): DataPoint[] {
  const length = runs.reduce((total, run) => total + run.length, 0);
  const gap = { freq: NaN, amp: NaN };
  return runs.flatMap((run, index) => {
    const budget = points === 'all' ? run.length : Math.max(2, Math.round(LATEX_MAX_POINTS * run.length / Math.max(1, length)));
    const sample = run.length <= budget ? run : Array.from({ length: budget }, (_, k) => run[Math.round(k * (run.length - 1) / (budget - 1))]!);
    return index === 0 ? sample : [gap, ...sample];
  });
}

function addSmithGrid(out: string[], mode: NonNullable<LatexFigureInput['smithGrid']>, drawGrid: boolean): void {
  const coord = (p: { re: number; im: number }) => `(axis cs:${latexNumber(p.re)},${latexNumber(p.im)})`;
  const circle = (value: SmithCircle) => Array.from({ length: 64 }, (_, i) => coord(pointOnCircle(value, i * Math.PI / 32))).join(' -- ') + ' -- cycle';
  out.push(`      \\draw[gray] ${circle(UNIT_CIRCLE)};`);
  if (!drawGrid) return;
  out.push('      \\draw[gray!45] (axis cs:-1,0) -- (axis cs:1,0);');
  const kinds = mode === 'both' ? ['z', 'y'] as const : [mode];
  for (const kind of kinds) {
    const grid = buildGrid(kind, gridValues(1));
    const ink = mode === 'both' && kind === 'y' ? 'blue!30' : 'gray!45';
    for (const entry of grid.circles) {
      if (entry.value !== 0) out.push(`      \\draw[${ink}] ${circle(entry.circle)};`);
    }
    for (const entry of grid.arcs) {
      const coords = Array.from({ length: 33 }, (_, i) => coord(pointOnArc(entry.arc, i / 32)));
      out.push(`      \\draw[${ink}] ${coords.join(' -- ')};`);
    }
  }
}
