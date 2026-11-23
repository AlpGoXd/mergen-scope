import { useLayoutEffect, useRef } from 'react';

export function useSheetFocus<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const sheet = ref.current;
    const trigger = document.activeElement;
    sheet?.focus({ preventScroll: true });
    return () => {
      if (sheet?.contains(document.activeElement) && trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);
  return ref;
}
