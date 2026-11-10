import { afterEach, expect, it, vi } from 'vitest';
import { readAppPreferences } from '../../src/components/settings/SettingsSheet';

afterEach(() => vi.unstubAllGlobals());

it('ignores old line styles and defaults symbols to repeat', () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  localStorage.setItem('mergen-app-preferences', JSON.stringify({ lineStyles: 'all' }));
  expect(readAppPreferences().traceSymbols).toBe('repeat');
  localStorage.setItem('mergen-app-preferences', JSON.stringify({ traceSymbols: 'always' }));
  expect(readAppPreferences().traceSymbols).toBe('always');
  localStorage.removeItem('mergen-app-preferences');
});
