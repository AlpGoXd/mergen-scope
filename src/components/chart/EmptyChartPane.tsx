import type { PaneTypeDefinition, PaneTypeId } from '../../types/registry-contract';
import { PaneTypeIcon } from '../panes/pane-type-icons';
import { PaneTypePicker, PICKER_TILES } from '../panes/PaneTypePicker';
import type { PickerTile } from '../panes/PaneTypePicker';
import { usePaneDispatch } from '../../stores/pane-store';
import { emptyStateFor } from './pane-renderers';

export interface EmptyChartPaneProps {
  mode?: 'files' | 'traces'; paneId?: string; compact?: boolean;
  types: readonly PaneTypeDefinition[]; currentType: PaneTypeId;
  displayState: 'picker' | 'empty-typed' | 'content'; paneNumber?: number;
  onSelectType: (type: PaneTypeDefinition) => void;
}

export function panePickerTiles(types: readonly PaneTypeDefinition[]): PickerTile[] {
  return PICKER_TILES.map(tile => {
    const type = types.find(item => item.id === tile.id && item.source !== 'analysis');
    return { ...tile, state: type?.status === 'available' ? 'available' : tile.id === 'spectrogram' ? 'needs-data' : 'later', reason: tile.id === 'table' ? tile.reason : type?.laterReason ?? tile.reason };
  });
}

export function EmptyChartPane({ mode = 'files', paneId, types, currentType, displayState, paneNumber = 1, onSelectType }: EmptyChartPaneProps) {
  const paneDispatch = usePaneDispatch();
  const tiles = panePickerTiles(types);
  const open = () => { if (paneId) paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId }); document.querySelector<HTMLInputElement>('[data-testid="app-open-input"]')?.click(); };
  const state = displayState === 'empty-typed' ? emptyStateFor(currentType) : null;
  return <div data-testid={mode === 'traces' ? 'empty-trace-pane-dropzone' : 'empty-chart-dropzone'}
    style={{ height: '100%', position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden', color: 'var(--text)' }}>
    {state ? <div style={{ textAlign: 'center' }}><PaneTypeIcon name={currentType} size={28}/><div className="t-card-title">{state.title}</div><p className="t-label">{state.sentence(paneNumber)}</p><button type="button" className="ui-btn ui-btn--neutral" onClick={open}>Open file…</button></div> :
      <PaneTypePicker tiles={tiles} onPick={id => { const type = types.find(item => item.id === id); if (type?.status === 'available') onSelectType(type); }} onOpenFile={open} />}
  </div>;
}
