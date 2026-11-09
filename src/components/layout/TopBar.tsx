import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import type { UiState } from '../../stores/ui-store';
import { useWorkspace } from '../../hooks/use-workspace';
import { useFileState, useFileDispatch } from '../../stores/file-store';
import { useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { usePaneDispatch } from '../../stores/pane-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { Btn } from '../shared/Btn';

interface TopBarProps {
  onOpen?: () => void;
  onExport?: () => void;
}

export function TopBar({ onOpen, onExport }: TopBarProps = {}) {
  const ui = useUiState();
  const dispatch = useUiDispatch();
  const { downloadWorkspace, loadFromFile } = useWorkspace();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { files } = useFileState(); const fileDispatch = useFileDispatch();
  const markerDispatch = useMarkerDispatch(); const { refLines } = useRefLineState();
  const lineDispatch = useRefLineDispatch(); const paneDispatch = usePaneDispatch();
  const aggregate = useOptionalAggregateWorkspace();
  const clearAll = () => {
    if (aggregate) {
      aggregate.historyDispatch({type:'change',toastMessage:'Cleared workspace',command:{slice:'transaction', actions:[
        ...files.map(file => ({slice:'files' as const,action:{type:'REMOVE_FILE' as const,payload:{fileId:String(file.id)}}})),
        {slice:'markers',action:{type:'CLEAR_ALL'}},
        ...refLines.map(line => ({slice:'lines' as const,action:{type:'REMOVE_LINE' as const,payload:line.id}})),
        {slice:'panes',limit:4,action:{type:'CLEAR_ALL_ZOOMS'}},
      ]}}); return;
    }
    files.forEach(file => fileDispatch({type:'REMOVE_FILE',payload:{fileId:String(file.id)}}));
    markerDispatch({type:'CLEAR_ALL'}); refLines.forEach(line => lineDispatch({type:'REMOVE_LINE',payload:line.id}));
    paneDispatch({type:'CLEAR_ALL_ZOOMS'});
  };
  const toggle = (key: keyof UiState, value: boolean) => {
    dispatch({ type: 'SET', payload: { key, value: !value } });
    if (key === 'showRightPanel' && !value && !ui.showAnalysisPanel) {
      dispatch({ type: 'SET', payload: { key: 'showAnalysisPanel', value: true } });
    }
  };
  const icon = (path: React.ReactNode) => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
  return <div style={{ minHeight: 'var(--top-row-height)', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', background: 'var(--panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
    <style>{'@media (max-width: 1279px) { .topbar-action-label { display: none; } }'}</style>
    <span style={{ whiteSpace: 'nowrap', fontSize: 'var(--font-title)', marginRight: 8 }}>Mergen <span style={{ color: 'var(--accent)' }}>Scope</span></span>
    <Btn variant="chip" tone="left" active={ui.showSidebar} title="Toggle left panel" onClick={() => toggle('showSidebar', ui.showSidebar)}>Left</Btn>
    <span aria-hidden="true" style={{ height: 20, borderLeft: '1px solid var(--border)', margin: '0 4px' }} />
    <input data-testid="topbar-workspace-input" type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={e => { if (e.target.files?.[0]) loadFromFile(e.target.files[0]); e.target.value = ''; }} />
    <Btn title={onOpen ? 'Open… (Ctrl+O)' : 'Load Workspace JSON'} aria-label="Open" onClick={onOpen ?? (() => fileInputRef.current?.click())}>{icon(<path d="M3 19V5h7l2 3h9v11z" />)}<span className="topbar-action-label">Open</span></Btn>
    <Btn title="Save Workspace JSON" aria-label="Save" onClick={() => downloadWorkspace()}>{icon(<><path d="M4 3h14l3 3v15H4z"/><path d="M8 3v6h9V3M8 21v-8h9v8"/></>)}<span className="topbar-action-label">Save</span></Btn>
    <Btn title={onExport ? 'Export…' : 'Export will be available after integration'} aria-label="Export" disabled={!onExport} onClick={onExport}>{icon(<><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v4h16v-4"/></>)}<span className="topbar-action-label">Export…</span></Btn>
    <span aria-hidden="true" style={{ height: 20, borderLeft: '1px solid var(--border)', margin: '0 4px' }} />
    <Btn variant="chip" tone="marker" active={ui.showMarkerTools} onClick={() => toggle('showMarkerTools', ui.showMarkerTools)}>Markers</Btn>
    <Btn variant="chip" tone="search" active={ui.showSearchTools} onClick={() => toggle('showSearchTools', ui.showSearchTools)}>Search</Btn>
    <Btn variant="chip" tone="lines" active={ui.showLineTools} onClick={() => toggle('showLineTools', ui.showLineTools)}>Lines</Btn>
    <Btn variant="chip" tone="pane" active={ui.showPaneTools} onClick={() => toggle('showPaneTools', ui.showPaneTools)}>Pane</Btn>
    {!onOpen && <><Btn title="Toggle right panel" onClick={() => toggle('showRightPanel', ui.showRightPanel)}>Right</Btn><Btn title="Remove all loaded files and clear state" onClick={clearAll}>Clear All</Btn></>}
    <Btn style={{ marginLeft: 'auto' }} variant="chip" tone="analysis" active={ui.showRightPanel} onClick={() => toggle('showRightPanel', ui.showRightPanel)}>Analysis</Btn>
  </div>;
}
