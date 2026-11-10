import type { PaneTypeId } from '../../types/registry-contract';

export function PaneTypeIcon({ type, size = 24 }: { type: PaneTypeId; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
    {type === 'chart' && <><path d="M3 3v18h18"/><path d="m5 17 4-5 4 2 6-8"/></>}
    {type === 'table' && <><rect x="3" y="4" width="18" height="16"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></>}
    {type === 'smith' && <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 12a4.5 4.5 0 0 1 9 0"/></>}
    {type === 'polar' && <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 5"/></>}
    {type === 'eye' && <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><path d="M4 7c4 0 5 10 8 10s4-10 8-10"/></>}
    {type === 'spectrogram' && <><path d="M4 20V9M8 20V4M12 20V11M16 20V6M20 20V13"/><path d="M2 20h20"/></>}
  </svg>;
}
