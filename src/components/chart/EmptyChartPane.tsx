import { useEffect, useRef, useState } from 'react';
import type { PaneTypeDefinition, PaneTypeId } from '../../types/registry-contract';
import { pickerStep } from '../../domain/pane-picker-layout';
import { PaneTypeIcon } from './pane-type-icons';
import { usePaneDispatch } from '../../stores/pane-store';
import { emptyStateFor } from './pane-renderers';

export interface EmptyChartPaneProps {
  mode?: 'files' | 'traces'; paneId?: string; compact?: boolean;
  types: readonly PaneTypeDefinition[]; currentType: PaneTypeId;
  chosen?: boolean; paneNumber?: number;
  onSelectType: (type: PaneTypeDefinition) => void;
}

export function EmptyChartPane({ mode = 'files', paneId, types, currentType, chosen = false, paneNumber = 1, onSelectType }: EmptyChartPaneProps) {
  const paneDispatch = usePaneDispatch();
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [focus, setFocus] = useState(0);
  const [drag, setDrag] = useState(false);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) setSize({ width: rect.width, height: rect.height }); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const { step, columns } = pickerStep(size.width, size.height);
  const items = types.filter(type => type.source !== 'analysis');
  const open = () => { if (paneId) paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId }); document.querySelector<HTMLInputElement>('[data-testid="app-open-input"]')?.click(); };
  const state = chosen ? emptyStateFor(currentType) : null;
  const iconSize = step === 'L' ? 24 : step === 'M' ? 22 : 16;
  return <div ref={container} data-testid={mode === 'traces' ? 'empty-trace-pane-dropzone' : 'empty-chart-dropzone'}
    onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={() => setDrag(false)}
    style={{ height: '100%', display: 'grid', placeItems: 'center', overflow: 'hidden', color: 'var(--text)' }}>
    {state ? <div style={{ textAlign: 'center', fontSize: 'var(--font-body)' }}><PaneTypeIcon type={currentType} size={28}/><div>{state.title}</div><p>{state.sentence(paneNumber)}</p><button type="button" onClick={open}>Open file?</button></div> :
    <div style={{ textAlign: 'center', maxWidth: '100%', fontSize: 'var(--font-label)' }}>
      {drag ? <div>{mode === 'traces' ? 'Drop trace to move' : 'Drop to import'}</div> : step === 'L' || step === 'M' ? <div>What should this pane show?</div> : step === 'S' ? <div>Pick a type or drop a file</div> : null}
      {step === 'L' && <div>Pick a type, or drop a file and the pane picks one that fits.</div>}
      <div role="group" aria-label="Pane types" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 4 }} onKeyDown={e => {
        const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? columns : e.key === 'ArrowUp' ? -columns : 0;
        if (!delta) return; e.preventDefault(); const next = (focus + delta + items.length + 1) % (items.length + 1); setFocus(next); e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
      }}>
        {items.map((type, index) => <button key={type.id} type="button" data-testid={`pane-type-tile-${type.id}`} tabIndex={focus === index ? 0 : -1} onFocus={() => setFocus(index)} aria-disabled={type.status === 'later'} title={type.laterReason ?? type.title} onClick={() => { if (type.status === 'available') onSelectType(type); }} style={{ color: 'var(--text)', opacity: type.status === 'later' ? 0.5 : 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, minHeight: step === 'S' ? 34 : step === 'I' ? 30 : undefined, width: step === 'I' ? 34 : undefined, fontSize: 'var(--font-label)' }}><PaneTypeIcon type={type.iconKey} size={iconSize}/>{step !== 'I' && <span>{type.title}</span>}{step === 'L' && <div>{type.description}</div>}{type.status === 'later' && step !== 'I' && <small>{type.id === 'spectrogram' ? 'needs data' : 'later'}</small>}</button>)}
        <button type="button" data-testid="pane-type-tile-open" tabIndex={focus === items.length ? 0 : -1} onFocus={() => setFocus(items.length)} title="Open file?" onClick={open} style={{ background: 'var(--card)', color: 'var(--text)', border: '1px dashed var(--border)', borderRadius: 6, minHeight: step === 'S' ? 34 : step === 'I' ? 30 : undefined, width: step === 'I' ? 34 : undefined, fontSize: 'var(--font-label)' }}><PaneTypeIcon type="open" size={iconSize}/>{step !== 'I' && <span>Open file?</span>}</button>
      </div>
      {(step === 'L' || step === 'M') && <div>Eye diagrams open from Analysis ? Eye diagram.</div>}
    </div>}
  </div>;
}
