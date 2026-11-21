import { IEEE_COLUMN_MM, mmToCssPx } from './export-image';
import type { ExportDpi, ExportTheme } from './export-image';
import type { Trace } from '../types/trace';

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'latex' | 'csv';
export type ExportScope = 'pane' | 'all' | 'pick';
export type ExportPreset = 'screen' | 'slide' | 'report' | 'ieee-1' | 'ieee-2' | 'custom';
export type ExportLegend = 'below' | 'inside' | 'off';

export interface LatexOptions {
  wrap: 'figure' | 'picture';
  width: 'column' | 'line' | 'fixed' | 'two-column';
  widthMm: number;
  data: 'inline' | 'zip';
  points: 'all' | '2000';
  colors: 'trace' | 'grayscale';
}

export const DEFAULT_LATEX_OPTIONS: LatexOptions = {
  wrap: 'figure', width: 'column', widthMm: 88.9, data: 'inline', points: '2000', colors: 'trace',
};

export interface ExportDocumentOptions {
  preset: ExportPreset;
  width: number;
  height: number;
  scale: 1 | 2 | 3;
  dpi: ExportDpi;
  theme: ExportTheme | null;
  include: Record<'title' | 'legend' | 'markerTags' | 'markerTable' | 'refLines' | 'date', boolean>;
  title: string;
  figureTitle?: boolean;
  paperHeight: Partial<Record<'ieee-1' | 'ieee-2', number>>;
  legend: ExportLegend;
  names: 'full' | 'short';
  filename: string;
  paperFont: 'serif' | 'sans';
  paperText: 8 | 9 | 10;
  paperLine: 0.5 | 0.75 | 1;
  axisTitles: 'auto' | 'edit' | 'off';
  paneTitles: Record<string, { x: string; y: string }>;
  grid: boolean;
  csvRange: 'visible' | 'full';
  csvTraces: 'visible' | 'all';
  csvMarkers: boolean;
  latex: LatexOptions;
}

export const DEFAULT_DOCUMENT_OPTIONS: ExportDocumentOptions = {
  preset: 'screen', width: 1280, height: 768, scale: 2, dpi: 600, theme: null,
  include: { title: true, legend: true, markerTags: true, markerTable: false, refLines: true, date: false },
  title: '', paperHeight: {}, legend: 'below', names: 'full', filename: '{file}_{pane}_{date}',
  paperFont: 'serif', paperText: 8, paperLine: 0.75, axisTitles: 'auto', paneTitles: {}, grid: true,
  csvRange: 'full', csvTraces: 'visible', csvMarkers: false, latex: DEFAULT_LATEX_OPTIONS,
};

export interface ExportBox { x: number; y: number; width: number; height: number }
export interface ExportGeometry { cssWidth: number; cssHeight: number; pixelWidth: number; pixelHeight: number; paper: boolean }
export const PAPER_HEIGHT_MM = { 'ieee-1': 60, 'ieee-2': 100 } as const;

/**
 * The TikZ preview sheet. LaTeX keeps each axis at its own height (`panelHeight` × width per row) and puts tick
 * labels, axis titles and legends outside it, so the real figure grows; the preview grows the same way (about
 * nine text lines per row) instead of squeezing the plots, so no title or legend name is cut off.
 */
export function latexPreviewGeometry<G extends ExportGeometry & { fileWidth: string; fileHeight: string }>(geometry: G, rows: number, panelHeight: number, textPx: number): G {
  const needed = Math.round(Math.max(1, rows) * (panelHeight * geometry.cssWidth + 9 * textPx));
  if (needed <= geometry.cssHeight) return geometry;
  const ratio = needed / geometry.cssHeight;
  const fileHeight = geometry.paper ? `${Number((parseFloat(geometry.fileHeight) * ratio).toFixed(1))}mm` : `${needed}px`;
  return { ...geometry, cssHeight: needed, pixelHeight: Math.round(geometry.pixelHeight * ratio), fileHeight };
}

export function documentGeometry(options: ExportDocumentOptions, bounds: ExportBox): ExportGeometry & { fileWidth: string; fileHeight: string } {
  const { preset, dpi, scale } = options;
  if (preset === 'ieee-1' || preset === 'ieee-2') {
    const width = IEEE_COLUMN_MM[preset];
    const height = options.paperHeight[preset] ?? PAPER_HEIGHT_MM[preset];
    return {
      cssWidth: Math.round(mmToCssPx(width)), cssHeight: Math.round(mmToCssPx(height)),
      pixelWidth: Math.round(width / 25.4 * dpi), pixelHeight: Math.round(height / 25.4 * dpi),
      paper: true, fileWidth: `${width}mm`, fileHeight: `${height}mm`,
    };
  }
  const defaults = preset === 'slide' ? { width: 1280, height: 720 } : preset === 'report' ? { width: 1200, height: 768 } : bounds;
  const pixels = (value: number) => Number.isFinite(value) ? Math.min(4096, Math.max(160, Math.round(value))) : 160;
  const cssWidth = pixels(preset === 'custom' ? options.width : defaults.width);
  const cssHeight = pixels(preset === 'custom' ? options.height : defaults.height);
  return { cssWidth, cssHeight, pixelWidth: cssWidth * scale, pixelHeight: cssHeight * scale, paper: false, fileWidth: `${cssWidth}px`, fileHeight: `${cssHeight}px` };
}

export function documentFileName(pattern: string, file: string | null | undefined, pane: string, date: Date, extension: string): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, '0')).join('-');
  const values = { file: file?.replace(/\.[^.]*$/, '') || 'mergen', pane, date: day };
  const base = (pattern.trim() || DEFAULT_DOCUMENT_OPTIONS.filename).replace(/\{(file|pane|date)\}/g, (_, key: keyof typeof values) => values[key]);
  const clean = base.replace(/[<>:"/\\|?*\s\x00-\x1f]+/g, '-').replace(/^[. -]+|[. -]+$/g, '');
  return `${clean || 'mergen'}.${extension}`;
}

export interface ExportCsvPane {
  readonly name: string;
  readonly traces: readonly Trace[];
  readonly range: readonly [number, number] | null;
  readonly markers: readonly { trace: string; x: number; y: number; name: string }[];
}

/** Each row carries its units, so panes with different domains can share one CSV. */
export function documentCsv(panes: readonly ExportCsvPane[], rowsPerPane = Infinity): string {
  const lines = ['Pane,Trace,X,X unit,Y,Y unit,Marker'];
  const cell = (value: string | number) => typeof value === 'string' && /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : String(value);
  for (const pane of panes) {
    const inRange = (x: number) => !pane.range || (x >= pane.range[0] && x <= pane.range[1]);
    const end = lines.length + rowsPerPane;
    paneTraces: for (const trace of pane.traces) {
      const add = (x: number, y: number, marker: string) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !inRange(x)) return;
        lines.push([pane.name, trace.dn || trace.name, x, trace.units.x ?? '', y, trace.units.y ?? '', marker].map(cell).join(','));
      };
      for (const point of trace.data) {
        if (lines.length >= end) break paneTraces;
        add(point.freq, point.amp, '');
      }
      for (const marker of pane.markers) {
        if (lines.length >= end) break paneTraces;
        if (marker.trace === trace.name) add(marker.x, marker.y, marker.name);
      }
    }
  }
  return lines.join('\r\n');
}
