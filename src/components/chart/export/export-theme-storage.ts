import type { ExportDocumentOptions, ExportFormat } from '../../../domain/export-document';
import type { ExportTheme } from '../../../domain/export-image';
import { appPreferencesKey } from '../../settings/app-preferences';

export const EXPORT_DOCUMENT_OPTIONS_KEY = 'mergen-export-document-options';
type DocumentPreferences = Partial<Record<ExportFormat, ExportDocumentOptions>> & { theme?: ExportTheme };
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function record(raw: string | null): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

function exportTheme(value: unknown): ExportTheme | undefined {
  return value === 'print' || value === 'dark' || value === 'app' ? value : undefined;
}

export function migrateExportTheme(storage: PreferenceStorage): void {
  const app = record(storage.getItem(appPreferencesKey));
  if (!('exportTheme' in app)) return;
  const saved = record(storage.getItem(EXPORT_DOCUMENT_OPTIONS_KEY));
  const theme = exportTheme(saved.theme) ?? exportTheme(app.exportTheme);
  if (theme !== undefined && saved.theme !== theme) {
    storage.setItem(EXPORT_DOCUMENT_OPTIONS_KEY, JSON.stringify({ ...saved, theme }));
  }
  const { exportTheme: _legacyTheme, ...remaining } = app;
  storage.setItem(appPreferencesKey, JSON.stringify(remaining));
}

let sessionTheme: ExportTheme | undefined;

export function readExportDocumentPreferences(): DocumentPreferences {
  try {
    migrateExportTheme(localStorage);
    return record(localStorage.getItem(EXPORT_DOCUMENT_OPTIONS_KEY)) as DocumentPreferences;
  } catch { return {}; }
}

export function saveExportDocumentPreferences(preferences: DocumentPreferences): void {
  try {
    localStorage.setItem(EXPORT_DOCUMENT_OPTIONS_KEY, JSON.stringify(preferences));
    sessionTheme = undefined;
  } catch {
    sessionTheme = preferences.theme;
  }
}

export function rememberedExportTheme(preferences = readExportDocumentPreferences()): ExportTheme {
  return sessionTheme ?? exportTheme(preferences.theme) ?? exportTheme(preferences.png?.theme) ?? exportTheme(preferences.svg?.theme) ?? 'print';
}
