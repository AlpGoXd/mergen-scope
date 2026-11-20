import { useLayoutEffect, useRef } from 'react';

export function useCenteredDialog(focusSurface = false) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    if (focusSurface) dialog?.focus();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [focusSurface]);
  return ref;
}
