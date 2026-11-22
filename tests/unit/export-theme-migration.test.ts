import { expect, it } from 'vitest';
import { EXPORT_DOCUMENT_OPTIONS_KEY, migrateExportTheme, rememberedExportTheme } from '../../src/components/chart/export/export-theme-storage';
import { appPreferencesKey } from '../../src/components/settings/app-preferences';

function storage(app: object, exportOptions: object = {}) {
  const items = new Map([[appPreferencesKey, JSON.stringify(app)], [EXPORT_DOCUMENT_OPTIONS_KEY, JSON.stringify(exportOptions)]]);
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
}

it('moves the former app export theme into dialog preferences once', () => {
  const saved = storage({ exportTheme: 'dark', neutral: 'pink' }, { png: { scale: 2 } });
  migrateExportTheme(saved);
  expect(saved.getItem(appPreferencesKey)).toBe('{"neutral":"pink"}');
  expect(saved.getItem(EXPORT_DOCUMENT_OPTIONS_KEY)).toBe('{"png":{"scale":2},"theme":"dark"}');
  saved.setItem(EXPORT_DOCUMENT_OPTIONS_KEY, '{"theme":"app"}');
  migrateExportTheme(saved);
  expect(saved.getItem(EXPORT_DOCUMENT_OPTIONS_KEY)).toBe('{"theme":"app"}');
});

it('preserves an already remembered theme and falls back to Print', () => {
  const saved = storage({ exportTheme: 'dark' }, { theme: 'app' });
  migrateExportTheme(saved);
  expect(saved.getItem(appPreferencesKey)).toBe('{}');
  expect(saved.getItem(EXPORT_DOCUMENT_OPTIONS_KEY)).toBe('{"theme":"app"}');
  expect(rememberedExportTheme({})).toBe('print');
});
