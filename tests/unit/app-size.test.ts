// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialWorkspaceState, snapshotFromWorkspace } from '../../src/stores/aggregate-workspace-store';
import { applyAppSize, DEFAULT_APP_SIZE, normalizeAppSize, readStoredAppSize } from '../../src/components/settings/app-size';
import { defaultAppPreferences, readAppPreferences } from '../../src/components/settings/SettingsSheet';
import { makeTestTrace } from './helpers';

const key = 'mergen-app-preferences';
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  delete document.documentElement.dataset.size;
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('app size preference', () => {
  it('defaults to Comfortable with nothing stored', () => {
    expect(DEFAULT_APP_SIZE).toBe('comfortable');
    expect(readStoredAppSize()).toBe('comfortable');
    expect(readAppPreferences().size).toBe('comfortable');
    expect(defaultAppPreferences.size).toBe('comfortable');
  });
  it('falls back to Comfortable for invalid values and ignores the legacy density field', () => {
    localStorage.setItem(key, JSON.stringify({ size: 'huge' }));
    expect(readStoredAppSize()).toBe('comfortable');
    localStorage.setItem(key, JSON.stringify({ density: 'compact' }));
    expect(readStoredAppSize()).toBe('comfortable');
    localStorage.setItem(key, '{not json');
    expect(readStoredAppSize()).toBe('comfortable');
    expect(normalizeAppSize(null)).toBe('comfortable');
  });
  it('reads each stored size back', () => {
    for (const size of ['compact', 'comfortable', 'large'] as const) {
      localStorage.setItem(key, JSON.stringify({ size }));
      expect(readStoredAppSize()).toBe(size);
      expect(readAppPreferences().size).toBe(size);
    }
  });
  it('applies the size as html[data-size]', () => {
    applyAppSize('large');
    expect(document.documentElement.dataset.size).toBe('large');
    applyAppSize('compact');
    expect(document.documentElement.dataset.size).toBe('compact');
  });
  it('falls back to the default when storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(readStoredAppSize()).toBe('comfortable');
  });
  it('is not part of a saved workspace', () => {
    localStorage.setItem(key, JSON.stringify({ size: 'large' }));
    const trace = makeTestTrace();
    const state = initialWorkspaceState();
    const snapshot = snapshotFromWorkspace({
      ...state,
      files: {
        ...state.files,
        files: [{ id: 'file-1', fileName: 'fixture.dat', meta: {}, traces: [trace], format: 'rs-dat' }],
      },
    });
    if (!snapshot) throw new Error('Expected a saved workspace');
    const text = JSON.stringify(snapshot);
    expect(text).not.toContain(key);
    expect(text).not.toMatch(/"(size|density)":"(compact|comfortable|large)"/);
  });
});
