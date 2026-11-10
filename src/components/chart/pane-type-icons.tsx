import type { PaneTypeId } from '../../types/registry-contract';

const paths: Record<PaneTypeId | 'open', string> = {
  chart: 'M3 3v18h18M7 15l4-5 3 3 5-7',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  smith: 'M12 3a9 9 0 1 0 0.01 0M12 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0M3 12h18',
  polar: 'M12 3a9 9 0 1 0 0.01 0M12 7.5a4.5 4.5 0 1 0 0.01 0M12 3v18M3 12h18',
  spectrogram: 'M3 4h18v16H3zM3 8h7M13 8h8M3 12h4M10 12h11M3 16h12',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0.01 0',
  open: 'M3 7h6l2 2h10v10H3z',
};
export function PaneTypeIcon({ type, size = 24 }: { type: PaneTypeId | 'open'; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type]}/></svg>;
}
