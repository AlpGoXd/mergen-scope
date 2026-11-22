import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void) {
  window.addEventListener('mergen-preferences', listener);
  return () => window.removeEventListener('mergen-preferences', listener);
}

function getSnapshot() {
  return document.documentElement.dataset.contrast === 'high';
}

export function useAppHighContrast() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
