import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

/** The footer's mouse-position text ("2.4370 GHz  −12.31 dB"), published by whichever pane the pointer is over. */
interface ReadoutStore {
  get: () => string | null;
  subscribe: (listener: () => void) => () => void;
  /** `null` clears the text, but only if `paneId` published it (another pane may already have taken over). */
  publish: (text: string | null, paneId: string) => void;
}
const emptyStore: ReadoutStore = { get: () => null, subscribe: () => () => {}, publish: () => {} };
const ReadoutContext = createContext<ReadoutStore>(emptyStore);

export function PointerReadoutProvider({ children }: { children: ReactNode }) {
  const store = useRef<ReadoutStore | null>(null);
  if (!store.current) {
    let current: { text: string; paneId: string } | null = null;
    const listeners = new Set<() => void>();
    store.current = {
      get: () => current?.text ?? null,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      publish: (text, paneId) => {
        if (text === null && current?.paneId !== paneId) return;
        const next = text === null ? null : { text, paneId };
        if (next?.text === current?.text && next?.paneId === current?.paneId) return;
        current = next;
        listeners.forEach(listener => listener());
      },
    };
  }
  return <ReadoutContext.Provider value={store.current}>{children}</ReadoutContext.Provider>;
}

export function usePointerReadoutPublisher() { return useContext(ReadoutContext).publish; }
/** The pointer's position text, or null while no pointer is over a pane. */
export function usePointerReadout(): string | null {
  const store = useContext(ReadoutContext);
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}
