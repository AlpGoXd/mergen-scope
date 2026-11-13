import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import type { UiState } from '../../stores/ui-store';
import { useWorkspace } from '../../hooks/use-workspace';
import { useFileState, useFileDispatch } from '../../stores/file-store';
import { useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { usePaneDispatch, usePaneState } from '../../stores/pane-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { Btn } from '../shared/Btn';
import { useTraceState } from '../../stores/trace-store';
import { tracesToCSV } from '../../domain/export';
import { BrandMark } from './BrandMark';
import { PopoverAt } from '../shared/Controls';
import { Menu } from '../left-panel/Menu';
import type { MenuEntry } from '../left-panel/Menu';
import { paneName } from '../../domain/line-view';
import { usePaneImageExport } from '../chart/export/export-context';

function downloadTextFile(fileName: string, text: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

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
  const { allTraces, vis } = useTraceState();
  const visibleTraces = allTraces.filter(trace => vis[trace.name] !== false);
  const exportVisibleCsv = () => { if (visibleTraces.length) downloadTextFile('visible-traces.csv', tracesToCSV(visibleTraces, 'Frequency'), 'text/csv;charset=utf-8'); };
  // Until the Export dialog, Export… is a small menu acting on the target pane (named in each item).
  const { panes, activePaneId } = usePaneState();
  const imageExport = usePaneImageExport();
  const [exportMenu, setExportMenu] = React.useState<HTMLElement | null>(null);
  const exportEntries = (): MenuEntry[] => {
    const target = panes.some(pane => pane.id === activePaneId) ? activePaneId : panes[0]?.id;
    const name = target ? paneName(panes, target) : 'pane';
    const item = (label: string, aside: string | undefined, format: 'image' | 'latex', run: (paneId: string) => void): MenuEntry => {
      const reason = !target || !imageExport ? 'No pane to export' : imageExport.unavailable(target, format);
      return { label: `${label} · ${name}`, ...(aside ? { aside } : {}), ...(reason ? { disabledReason: reason } : {}), onSelect: () => { setExportMenu(null); if (target) run(target); } };
    };
    return [
      item('Copy image', 'Ctrl+Shift+C', 'image', paneId => imageExport?.copyImage(paneId)),
      item('Download image', 'Ctrl+Shift+S', 'image', paneId => imageExport?.downloadImage(paneId)),
      item('Download SVG', undefined, 'image', paneId => imageExport?.downloadSvg(paneId)),
      item('Copy as LaTeX', undefined, 'latex', paneId => imageExport?.copyLatex(paneId)),
      'separator',
      { label: 'Export data (CSV)…', note: 'visible traces', ...(visibleTraces.length ? {} : { disabledReason: 'Load a trace to export' }), onSelect: () => { setExportMenu(null); exportVisibleCsv(); } },
      { label: 'All panes…', note: 'Coming with the export dialog', noteBelow: true, disabledReason: 'Coming with the export dialog' },
    ];
  };
  const clearAll = () => {
    if (aggregate) {
      aggregate.historyDispatch({type:'change',toastMessage:'Cleared workspace',toastKind:'delete',command:{slice:'transaction', actions:[
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
  };
  const icon = (path: React.ReactNode) => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
  return <div style={{ minHeight: 'var(--top-row-height)', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', background: 'var(--panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
    <style>{'@media (max-width: 1279px) { .topbar-action-label { display: none; } }'}</style>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', whiteSpace: 'nowrap', fontSize: 'var(--font-title)', marginRight: 8 }}><BrandMark /><span>Mergen <span style={{ color: 'var(--accent)' }}>Scope</span></span></span>
    <Btn variant="chip" tone="left" active={ui.showSidebar} title="Toggle left panel" onClick={() => toggle('showSidebar', ui.showSidebar)}>Left</Btn>
    <span aria-hidden="true" style={{ height: 20, borderLeft: '1px solid var(--border)', margin: '0 4px' }} />
    <input data-testid="topbar-workspace-input" type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={e => { if (e.target.files?.[0]) loadFromFile(e.target.files[0]); e.target.value = ''; }} />
    <Btn title={onOpen ? 'Open… (Ctrl+O)' : 'Load Workspace JSON'} aria-label="Open" onClick={onOpen ?? (() => fileInputRef.current?.click())}>{icon(<path d="M3 19V5h7l2 3h9v11z" />)}<span className="topbar-action-label">Open</span></Btn>
    <Btn title="Save Workspace JSON" aria-label="Save" onClick={() => downloadWorkspace()}>{icon(<><path d="M4 3h14l3 3v15H4z"/><path d="M8 3v6h9V3M8 21v-8h9v8"/></>)}<span className="topbar-action-label">Save</span></Btn>
    <Btn title={visibleTraces.length || onExport ? 'Export the target pane' : 'Load a trace to export'} aria-label="Export" aria-haspopup="menu" aria-expanded={exportMenu !== null} active={exportMenu !== null} disabled={!onExport && visibleTraces.length === 0}
      onClick={event => { if (onExport) { onExport(); return; } setExportMenu(exportMenu ? null : event.currentTarget); }}>{icon(<><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v4h16v-4"/></>)}<span className="topbar-action-label">Export…</span></Btn>
    {exportMenu && <PopoverAt label="Export" at={exportMenu} onClose={() => setExportMenu(null)}><Menu label="Export" entries={exportEntries()} style={{ minWidth: 280 }} /></PopoverAt>}
    <span aria-hidden="true" style={{ height: 20, borderLeft: '1px solid var(--border)', margin: '0 4px' }} />
    <Btn variant="chip" tone="marker" active={ui.showMarkerTools} onClick={() => toggle('showMarkerTools', ui.showMarkerTools)}>Markers</Btn>
    <Btn variant="chip" tone="search" active={ui.showSearchTools} onClick={() => toggle('showSearchTools', ui.showSearchTools)}>Search</Btn>
    <Btn variant="chip" tone="lines" active={ui.showLineTools} onClick={() => toggle('showLineTools', ui.showLineTools)}>Lines</Btn>
    <Btn variant="chip" tone="pane" active={ui.showPaneTools} onClick={() => toggle('showPaneTools', ui.showPaneTools)}>Pane</Btn>
    {!onOpen && <Btn title="Remove all loaded files and clear state" onClick={clearAll}>Clear All</Btn>}
    <Btn style={{ marginLeft: 'auto' }} variant="chip" tone="analysis" active={ui.showRightPanel} onClick={() => toggle('showRightPanel', ui.showRightPanel)}>Analysis</Btn>
  </div>;
}
