import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import type { UiState } from '../../stores/ui-store';
import { useWorkspace } from '../../hooks/use-workspace';
import { Btn } from '../shared/Btn';
import { useTraceState } from '../../stores/trace-store';
import { tracesToCSV } from '../../domain/export';
import { BrandMark } from './BrandMark';
import { PopoverAt } from '../shared/Controls';
import { ExportMenu } from './ExportMenu';
import { ToolGroups } from './ToolGroups';
import { useShortcut } from '../../stores/shortcut-store';
import { shortcutText } from '../../domain/shortcuts';
import { usePaneImageExport } from '../chart/export/export-context';

function downloadTextFile(fileName: string, text: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

interface TopBarProps {
  /** Embed mode (landing page frame): the brand links back to the site, out of the frame. */
  embed?: boolean;
  onOpen?: () => void;
  onExport?: () => void;
}

export function TopBar({ embed = false, onOpen, onExport }: TopBarProps = {}) {
  const ui = useUiState();
  const dispatch = useUiDispatch();
  const { downloadWorkspace, loadFromFile } = useWorkspace();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { allTraces, vis } = useTraceState();
  const visibleTraces = allTraces.filter(trace => vis[trace.name] !== false);
  const exportVisibleCsv = () => { if (visibleTraces.length) downloadTextFile('visible-traces.csv', tracesToCSV(visibleTraces, 'Frequency'), 'text/csv;charset=utf-8'); };
  // The menu is the fallback for callers outside the export provider.
  const [exportMenu, setExportMenu] = React.useState<HTMLElement | null>(null);
  const exportButton = React.useRef<HTMLButtonElement | null>(null);
  const imageExport = usePaneImageExport();
  const hasTraces = imageExport ? allTraces.length > 0 : visibleTraces.length > 0;
  const openExport = onExport ?? imageExport?.openDialog;
  useShortcut('export', () => {
    if (embed) return; // no Export button in the landing frame: take the key, do nothing
    if (!exportButton.current || exportButton.current.disabled) return false;
    if (openExport) openExport();
    else setExportMenu(exportButton.current);
  });
  const toggle = (key: keyof UiState, value: boolean) => {
    dispatch({ type: 'SET', payload: { key, value: !value } });
  };
  const icon = (path: React.ReactNode) => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
  // Panel toggles (Left, Analysis) show their panel: a box with the panel's side marked. They open panels, not tool groups.
  const panelIcon = (path: string) => <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
  // One row of siblings: the left block (brand, Left, file buttons), the divider, the tool groups (which wrap inside
  // their own container, only they wrap) and Analysis at the right end. The bar stretches its children, so the
  // wrapping container sets the bar's height. The two fixed clusters are one row tall and pinned to the top line,
  // so a wrapped second line of groups does not move them. The divider before the groups stretches with the bar
  // (by layout, not by measuring), so it spans both lines when the groups wrap, with the same inset above and
  // below that centres a 20 px divider on one line. (Clear workspace… lives in the Files ⋯ menu.)
  const brandStyle = { display: 'inline-flex', alignItems: 'center', gap: '0.4em', whiteSpace: 'nowrap', fontSize: 'var(--font-title)', fontWeight: 'var(--fw-semibold)', marginRight: 8, color: 'var(--text)', textDecoration: 'none' } as const;
  const brand = <><BrandMark /><span>Mergen <span className="topbar-brand-scope">Scope</span></span></>;
  const cluster = { display: 'flex', alignItems: 'center', alignSelf: 'flex-start', gap: 4, height: 'var(--top-row-height)', flex: 'none' } as const;
  return <div style={{ minHeight: 'var(--top-row-height)', display: 'flex', alignItems: 'stretch', gap: 4, padding: '0 8px', background: 'var(--panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
    <style>{'@media (max-width: 1279px) { .topbar-action-label { display: none; } } .ui-btn.topbar-panel-toggle { height: var(--control-height); min-height: 0; gap: 5px; }'}</style>
    <div style={cluster}>
    {embed ? <a className="topbar-brand" href="/" target="_top" data-testid="topbar-brand-link" style={brandStyle}>{brand}</a> : <span className="topbar-brand" style={brandStyle}>{brand}</span>}
    {/* Embed mode keeps the brand and the tool groups only: the panels and file actions do nothing in the landing frame. */}
    {!embed && <>
    <Btn variant="chip" tone="left" active={ui.showSidebar} className="topbar-panel-toggle" title="Toggle left panel" onClick={() => toggle('showSidebar', ui.showSidebar)}>{panelIcon('M3 4h18v16H3zM9 4v16')}Left</Btn>
    <span aria-hidden="true" style={{ height: 20, borderLeft: '1px solid var(--border)', margin: '0 4px' }} />
    <input data-testid="topbar-workspace-input" type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={e => { if (e.target.files?.[0]) loadFromFile(e.target.files[0]); e.target.value = ''; }} />
    <Btn title={onOpen ? 'Open… (Ctrl+O)' : 'Load Workspace JSON'} aria-label="Open" onClick={onOpen ?? (() => fileInputRef.current?.click())}>{icon(<path d="M3 19V5h7l2 3h9v11z" />)}<span className="topbar-action-label">Open</span></Btn>
    <Btn title="Save Workspace JSON" aria-label="Save" onClick={() => downloadWorkspace()}>{icon(<><path d="M4 3h14l3 3v15H4z"/><path d="M8 3v6h9V3M8 21v-8h9v8"/></>)}<span className="topbar-action-label">Save</span></Btn>
    <Btn ref={exportButton} title={hasTraces || onExport ? `Export… (${shortcutText('export')})` : 'Load a trace to export'} aria-label="Export" aria-haspopup={openExport ? 'dialog' : 'menu'} aria-expanded={openExport ? undefined : exportMenu !== null} active={exportMenu !== null} disabled={!onExport && !hasTraces}
      onClick={event => { if (openExport) openExport(); else setExportMenu(exportMenu ? null : event.currentTarget); }}>{icon(<><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v4h16v-4"/></>)}<span className="topbar-action-label">Export…</span></Btn>
    {exportMenu && <PopoverAt label="Export" at={exportMenu} onClose={() => setExportMenu(null)}><ExportMenu onClose={() => setExportMenu(null)} onExportCsv={exportVisibleCsv} csvReason={visibleTraces.length ? null : 'Load a trace to export'} /></PopoverAt>}
    </>}
    </div>
    <span data-testid="topbar-groups-divider" aria-hidden="true" style={{ alignSelf: 'stretch', flex: 'none', width: 0, borderLeft: '1px solid var(--border)', margin: 'calc((var(--top-row-height) - 20px) / 2) 4px' }} />
    <ToolGroups />
    {!embed && <div style={{ ...cluster, marginLeft: 'auto' }}>
      <Btn variant="chip" tone="analysis" active={ui.showRightPanel} className="topbar-panel-toggle" onClick={() => toggle('showRightPanel', ui.showRightPanel)}>{panelIcon('M3 4h18v16H3zM15 4v16')}Analysis</Btn>
    </div>}
  </div>;
}
