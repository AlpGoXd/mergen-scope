import { DEFAULT_EXPORT_OPTIONS, EXPORT_OPTIONS_KEY, parseExportOptions } from '../../../domain/export-image';
import type { ExportImageOptions } from '../../../domain/export-image';

/** Image options live in this browser only, never in workspace files. */
export function readExportOptions(): ExportImageOptions {
  try { return parseExportOptions(localStorage.getItem(EXPORT_OPTIONS_KEY)); } catch { return DEFAULT_EXPORT_OPTIONS; }
}

export function saveExportOptions(options: ExportImageOptions): void {
  try { localStorage.setItem(EXPORT_OPTIONS_KEY, JSON.stringify(options)); } catch { /* storage unavailable: the choice lasts for this session */ }
}
