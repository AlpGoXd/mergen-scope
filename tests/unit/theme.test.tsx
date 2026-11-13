import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { useTheme } from '../../src/hooks/use-theme';
import { useWorkspace } from '../../src/hooks/use-workspace';

let dark = false;
let listeners: Set<() => void>;
let storage: Map<string, string>;
const key = 'mergen-theme-preference';
beforeEach(() => {
  dark = false; listeners = new Set(); storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return dark; }, addEventListener: (_: string, cb: () => void) => listeners.add(cb), removeEventListener: (_: string, cb: () => void) => listeners.delete(cb) })));
});
afterEach(() => { vi.unstubAllGlobals(); document.documentElement.className = ''; });
function flip(value: boolean) { dark = value; act(() => listeners.forEach(cb => cb())); }

describe('theme preference', () => {
  it('follows the system, persists a manual choice and resumes system tracking', async () => {
    const { result, unmount } = renderHook(() => useTheme(), { wrapper: StoreRoot });
    await waitFor(() => expect(result.current.theme).toBe('light'));
    flip(true); await waitFor(() => expect(result.current.theme).toBe('dark'));
    act(() => result.current.setTheme('light')); await waitFor(() => expect(result.current.theme).toBe('light'));
    expect(storage.get(key)).toBe('light'); flip(false); flip(true); expect(result.current.theme).toBe('light');
    unmount();
    const again = renderHook(() => useTheme(), { wrapper: StoreRoot });
    await waitFor(() => expect(again.result.current.theme).toBe('light'));
    act(() => again.result.current.setTheme('system')); await waitFor(() => expect(again.result.current.theme).toBe('dark'));
    expect(storage.has(key)).toBe(false);
  });
  it.each([['dark', false], ['light', true]] as const)('uses saved %s on the first render', (saved, systemDark) => {
    storage.set(key, saved); dark = systemDark;
    const seen: string[] = [];
    renderHook(() => { const theme = useTheme(); seen.push(theme.theme); return theme; }, { wrapper: StoreRoot });
    expect(seen[0]).toBe(saved);
  });
  it('preserves the current theme when an older restore callback runs late', async () => {
    const { result } = renderHook(() => ({ theme: useTheme(), workspace: useWorkspace() }), { wrapper: StoreRoot });
    const staleRestore = result.current.workspace.restore;
    const snapshot = result.current.workspace.getSnapshot();
    act(() => result.current.theme.setTheme('dark'));
    await waitFor(() => expect(result.current.theme.theme).toBe('dark'));
    act(() => staleRestore({ ...snapshot, ui: { ...snapshot.ui, theme: 'glass' } }));
    expect(result.current.theme.theme).toBe('dark');
    expect(result.current.workspace.getSnapshot().ui).not.toHaveProperty('theme');
  });
  it('works without storage and shares one system listener among consumers', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } });
    const { result } = renderHook(() => [useTheme(), useTheme()], { wrapper: StoreRoot });
    expect(listeners.size).toBe(1);
    act(() => result.current[0]?.setTheme('dark'));
    await waitFor(() => expect(result.current[1]?.theme).toBe('dark'));
    expect(listeners.size).toBe(0);
  });
  it('reads colors after the root theme class changes', async () => {
    const original = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = original(element);
      return new Proxy(style, { get(target, prop) { if (prop === 'getPropertyValue') return () => document.documentElement.classList.contains('theme-dark') ? 'dark-token' : 'light-token'; return Reflect.get(target, prop); } });
    });
    const { result } = renderHook(() => useTheme(), { wrapper: StoreRoot });
    await waitFor(() => expect(result.current.colors?.tr[0]).toBe('light-token'));
    act(() => result.current.setTheme('dark'));
    await waitFor(() => expect(result.current.colors?.tr[0]).toBe('dark-token'));
    vi.restoreAllMocks();
  });
  it.each(['dark', 'light', 'glass'] as const)('keeps the preference when restoring legacy %s and saves v5 without appearance preferences', async (legacy) => {
    const { result } = renderHook(() => ({ theme: useTheme(), workspace: useWorkspace() }), { wrapper: StoreRoot });
    act(() => result.current.theme.setTheme('light'));
    await waitFor(() => expect(result.current.theme.theme).toBe('light'));
    const snapshot = result.current.workspace.getSnapshot();
    act(() => result.current.workspace.restore({ ...snapshot, ui: { ...snapshot.ui, theme: legacy } }));
    await waitFor(() => expect(result.current.theme.theme).toBe('light'));
    const saved = result.current.workspace.getSnapshot();
    expect(saved.version).toBe(5); expect(saved.ui).not.toHaveProperty('theme');
    expect(saved.ui).not.toHaveProperty('preference'); expect(storage.get(key)).toBe('light');
  });
});
