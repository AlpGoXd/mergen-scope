import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export interface SharedHover { paneId: string; xUnit: string; value: number }
interface HoverStore {
  get: () => SharedHover | null;
  subscribe: (listener: () => void) => () => void;
  publish: (value: SharedHover | null, paneId: string) => void;
}
const emptyStore: HoverStore = { get: () => null, subscribe: () => () => {}, publish: () => {} };
const HoverContext = createContext<HoverStore>(emptyStore);

export function SharedHoverProvider({ children }: { children: ReactNode }) {
  const store = useRef<HoverStore | null>(null);
  if (!store.current) {
    let hover: SharedHover | null = null;
    const listeners = new Set<() => void>();
    store.current = {
      get: () => hover,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      publish: (next, paneId) => {
        const value = next ?? (hover?.paneId === paneId ? null : hover);
        if (value === hover) return;
        hover = value;
        listeners.forEach(listener => listener());
      },
    };
  }
  return <HoverContext.Provider value={store.current}>{children}</HoverContext.Provider>;
}

export function useSharedHoverPublisher() { return useContext(HoverContext).publish; }
/**
 * The X value hovered in another pane with the same X unit, linked or not (the crosshair only reads), else null.
 * Units are compared as published: the normalized pane unit ("Hz", "s", …).
 */
export function useSharedHoverValue(paneId: string, xUnit: string | null): number | null {
  const store = useContext(HoverContext);
  const get = () => {
    const hover = store.get();
    return xUnit !== null && hover && hover.paneId !== paneId && hover.xUnit === xUnit ? hover.value : null;
  };
  return useSyncExternalStore(xUnit !== null ? store.subscribe : emptyStore.subscribe, get, () => null);
}
export function useLinkedHoverFrequency(paneId: string, enabled: boolean): number | null {
  const store = useContext(HoverContext);
  const get = () => {
    const hover = store.get();
    return enabled && hover && hover.paneId !== paneId && hover.xUnit.toLowerCase() === 'hz' ? hover.value : null;
  };
  return useSyncExternalStore(enabled ? store.subscribe : emptyStore.subscribe, get, () => null);
}
