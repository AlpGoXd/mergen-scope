/**
 * Pane image export: sizes (pane at 2×, IEEE columns at a chosen dpi), file naming, stored options and legend layout.
 * 1 CSS px = 1/96 in at final size, so paper text and lines are set in points.
 */
export type ExportSize = 'pane' | 'ieee-1' | 'ieee-2';
export type ExportDpi = 150 | 300 | 600;
export type ExportTheme = 'print' | 'dark' | 'app';
export interface ExportImageOptions { size: ExportSize; dpi: ExportDpi; theme: ExportTheme | null }

export const DEFAULT_EXPORT_OPTIONS: ExportImageOptions = { size: 'pane', dpi: 600, theme: null };
export const EXPORT_OPTIONS_KEY = 'mergen-export-image-options';
export const IEEE_COLUMN_MM = { 'ieee-1': 88.9, 'ieee-2': 181.9 } as const;
export const PAPER_TEXT_PT = 8;
export const PAPER_LINE_PT = 0.75;
/** Paper marks scale with the 8 pt text: trace symbols, sample dots and marker glyphs about 2.5 pt radius, tags 7.5 pt. */
export const PAPER_MARK_RADIUS_PT = 2.5;
export const PAPER_TAG_PT = 7.5;
export const ptToCssPx = (pt: number): number => pt * 96 / 72;
export const mmToCssPx = (mm: number): number => mm / 25.4 * 96;

export function exportGeometry(options: ExportImageOptions, pane: { width: number; height: number }) {
  const validDimension = (n: number) => Number.isFinite(n) && n > 0;
  const dimension = (n: number) => validDimension(n) ? Math.max(1, Math.round(n)) : 1;
  if (options.size === 'pane') {
    const cssWidth = dimension(pane.width), cssHeight = dimension(pane.height);
    return { cssWidth, cssHeight, pixelWidth: cssWidth * 2, pixelHeight: cssHeight * 2, paper: false };
  }
  const mm = IEEE_COLUMN_MM[options.size];
  const cssWidth = Math.max(1, Math.round(mmToCssPx(mm)));
  const ratio = validDimension(pane.width) && validDimension(pane.height) ? Math.min(1, Math.max(0.45, pane.height / pane.width)) : 0.62;
  const cssHeight = Math.max(1, Math.round(cssWidth * ratio));
  const pixelWidth = Math.max(1, Math.round(mm / 25.4 * options.dpi));
  return { cssWidth, cssHeight, pixelWidth, pixelHeight: Math.max(1, Math.round(cssHeight * pixelWidth / cssWidth)), paper: true };
}

export function exportImageFileName(fileName: string | null, paneName: string, date: Date): string {
  return exportFileName(fileName, paneName, date, 'png');
}

/** `{file}_{pane}_{yyyy-mm-dd}.{extension}`. */
export function exportFileName(fileName: string | null, paneName: string, date: Date, extension: 'png' | 'svg' | 'tex'): string {
  const clean = (value: string) => value.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  const file = clean((fileName ?? '').replace(/\.[^.]*$/, '')) || 'mergen';
  const day = [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  return `${file}_${clean(paneName)}_${day}.${extension}`;
}

/** Width and height attributes of a downloaded SVG: millimetres for paper sizes, CSS px for the pane size. */
export function exportPhysicalSize(options: ExportImageOptions, geometry: { cssWidth: number; cssHeight: number }): { width: string; height: string } {
  if (options.size === 'pane') return { width: `${geometry.cssWidth}px`, height: `${geometry.cssHeight}px` };
  const mm = IEEE_COLUMN_MM[options.size];
  const height = Math.round(mm * geometry.cssHeight / Math.max(1, geometry.cssWidth) * 100) / 100;
  return { width: `${mm}mm`, height: `${height}mm` };
}

export function parseExportOptions(raw: unknown): ExportImageOptions {
  let value: unknown = raw;
  if (typeof raw === 'string') { try { value = JSON.parse(raw) as unknown; } catch { value = null; } }
  const fields = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const size = fields.size === 'pane' || fields.size === 'ieee-1' || fields.size === 'ieee-2' ? fields.size : DEFAULT_EXPORT_OPTIONS.size;
  const dpi = fields.dpi === 150 || fields.dpi === 300 || fields.dpi === 600 ? fields.dpi : DEFAULT_EXPORT_OPTIONS.dpi;
  const theme = fields.theme === 'print' || fields.theme === 'dark' || fields.theme === 'app' || fields.theme === null ? fields.theme : DEFAULT_EXPORT_OPTIONS.theme;
  return { size, dpi, theme };
}

/**
 * Legend items left to right, wrapping to a new row when one does not fit. `lines[i]` is how many text lines
 * item i has (a wrapped name, see wrapLegendLabel); a row is as tall as its tallest item.
 */
export function layoutLegend(widths: readonly number[], maxWidth: number, opts: { itemGap: number; rowHeight: number; padding: number }, lines: readonly number[] = []) {
  if (widths.length === 0) return { items: [], height: 0 };
  const items: { x: number; y: number }[] = [];
  let x = opts.padding, y = opts.padding, rowLines = 1;
  widths.forEach((width, index) => {
    const itemLines = Math.max(1, lines[index] ?? 1);
    if (x > opts.padding && x + width > maxWidth - opts.padding) { y += rowLines * opts.rowHeight; x = opts.padding; rowLines = 1; }
    items.push({ x, y });
    rowLines = Math.max(rowLines, itemLines);
    x += width + opts.itemGap;
  });
  return { items, height: y + rowLines * opts.rowHeight + opts.padding };
}

/**
 * Break a legend name into lines no wider than `maxPx`, so it is never cut off: at spaces first, then after
 * "_", "-", "." or "/", and as a last resort inside a word. `measure` gives a string's width in px.
 */
export function wrapLegendLabel(label: string, maxPx: number, measure: (text: string) => number): string[] {
  if (maxPx <= 0 || measure(label) <= maxPx) return [label];
  const pieces = label.split(/(?<=\s)|(?<=[_\-./])/u).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const push = (text: string) => { if (text.trim()) lines.push(text.trimEnd()); };
  for (const piece of pieces) {
    if (measure(line + piece) <= maxPx) { line += piece; continue; }
    push(line); line = '';
    let rest = piece;
    while (measure(rest) > maxPx && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && measure(rest.slice(0, cut)) > maxPx) cut -= 1;
      push(rest.slice(0, cut)); rest = rest.slice(cut);
    }
    line = rest.trimStart();
  }
  push(line);
  return lines.length ? lines : [label];
}
