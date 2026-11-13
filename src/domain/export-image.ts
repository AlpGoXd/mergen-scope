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

export function layoutLegend(widths: readonly number[], maxWidth: number, opts: { itemGap: number; rowHeight: number; padding: number }) {
  if (widths.length === 0) return { items: [], height: 0 };
  const items: { x: number; y: number }[] = [];
  let x = opts.padding, row = 0;
  for (const width of widths) {
    if (x > opts.padding && x + width > maxWidth - opts.padding) { row += 1; x = opts.padding; }
    items.push({ x, y: opts.padding + row * opts.rowHeight });
    x += width + opts.itemGap;
  }
  return { items, height: (row + 1) * opts.rowHeight + 2 * opts.padding };
}
