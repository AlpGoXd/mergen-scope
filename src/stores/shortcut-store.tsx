import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { findShortcut } from '../domain/shortcuts';
import type { KeyStroke, ShortcutId } from '../domain/shortcuts';

/**
 * Binds the keys of src/domain/shortcuts.ts once. Components that own an action register a handler for its id
 * (useShortcut); the newest registration runs first, and a handler that returns false passes the key on.
 */
type Handler = (stroke: KeyStroke) => boolean | void;
interface ShortcutRegistry { add: (id: ShortcutId, handler: { current: Handler }) => () => void }
const ShortcutContext = createContext<ShortcutRegistry | null>(null);

declare global {
  interface Window {
    /** Development only: ids of the shortcuts whose handler ran, read by the e2e tests. */
    __mergenShortcutLog?: string[];
  }
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);
/** True when the focused element edits text: shortcuts never fire there (Ctrl+Z, letters and Space belong to it). */
export function isTextEntry(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (target.isContentEditable || target.closest('textarea, select, [contenteditable="true"]')) return true;
  const input = target.closest('input');
  return input instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(input.type);
}

/** Controls that own plain keys (Space, arrows, letters) while focused. */
const OWNS_PLAIN_KEYS = 'button, a[href], select, summary, [role="menu"], [role="menuitem"], [role="menuitemcheckbox"], [role="slider"], [role="radio"], [role="radiogroup"], [role="tab"], [role="option"], [role="listbox"], [role="grid"]';

export function strokeOf(event: KeyboardEvent): KeyStroke {
  return { key: event.key, code: event.code, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey };
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const handlers = useRef(new Map<ShortcutId, { current: Handler }[]>());
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const stroke = strokeOf(event);
      const shortcut = findShortcut(stroke);
      if (!shortcut) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (isTextEntry(target)) return;
      // A modal dialog (the import wizard, a confirmation) owns the keyboard.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (shortcut.plain && target?.closest(OWNS_PLAIN_KEYS)) return;
      const stack = handlers.current.get(shortcut.id) ?? [];
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const handler = stack[i];
        if (!handler || handler.current(stroke) === false) continue;
        event.preventDefault();
        if (import.meta.env.DEV) (window.__mergenShortcutLog ??= []).push(shortcut.id);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const registry = useMemo<ShortcutRegistry>(() => ({
    add: (id, handler) => {
      const stack = handlers.current.get(id) ?? [];
      stack.push(handler);
      handlers.current.set(id, stack);
      return () => {
        const current = handlers.current.get(id) ?? [];
        handlers.current.set(id, current.filter(item => item !== handler));
      };
    },
  }), []);
  return <ShortcutContext.Provider value={registry}>{children}</ShortcutContext.Provider>;
}

/** Run `handler` for shortcut `id` while mounted (and `enabled`). Return false to let an older handler take the key. */
export function useShortcut(id: ShortcutId, handler: Handler, enabled = true): void {
  const registry = useContext(ShortcutContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!registry || !enabled) return;
    return registry.add(id, ref);
  }, [registry, id, enabled]);
}
