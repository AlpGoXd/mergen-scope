import React from 'react';
import { useUiState, useUiDispatch } from '../../stores/ui-store';
import type { UiState } from '../../stores/ui-store';
import { useFileState, useFileDispatch } from '../../stores/file-store';
import { useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../../stores/ref-line-store';
import { usePaneDispatch } from '../../stores/pane-store';
import { useWorkspace } from '../../hooks/use-workspace';
import { Btn } from '../shared/Btn';

/**
 * TopBar component for application-level actions and toggles.
 * Ported from legacy TopBar in app-shell-components.js.
 */
export function TopBar() {
  const {
    showSidebar,
    showRightPanel,
    showAnalysisPanel,
    showTraceOps,
    showDT,
    showImportExportPanel,
    showPaneTools,
    showSearchTools,
    showMarkerTools,
    showLineTools,
    showViewTools,
    showDots,
  } = useUiState();

  const { files } = useFileState();
  const uiDispatch = useUiDispatch();
  const { downloadWorkspace, loadFromFile } = useWorkspace();

  const fileDispatch = useFileDispatch();
  const markerDispatch = useMarkerDispatch();
  const { refLines } = useRefLineState();
  const refLineDispatch = useRefLineDispatch();
  const paneDispatch = usePaneDispatch();

  const hasData = files.length > 0;

  const handleToggle = (key: keyof UiState, currentVal: boolean) => {
    uiDispatch({ type: 'SET', payload: { key, value: !currentVal } });
    if (key === 'showRightPanel' && !currentVal && !showAnalysisPanel && !showTraceOps && !showDT && !showImportExportPanel) {
      uiDispatch({ type: 'SET', payload: { key: 'showAnalysisPanel', value: true } });
    }
    if ((key === 'showAnalysisPanel' || key === 'showTraceOps' || key === 'showDT' || key === 'showImportExportPanel') && !currentVal) {
      uiDispatch({ type: 'SET', payload: { key: 'showRightPanel', value: true } });
    }
  };

  const handleClearAll = () => {
    files.forEach(f => fileDispatch({ type: 'REMOVE_FILE', payload: { fileId: String(f.id) } }));
    markerDispatch({ type: 'CLEAR_ALL' });
    refLines.forEach(rl => refLineDispatch({ type: 'REMOVE_LINE', payload: rl.id }));
    paneDispatch({ type: 'CLEAR_ALL_ZOOMS' });
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const groupStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    padding: '6px 8px',
    border: '1px solid color-mix(in srgb, var(--accent) 10%, var(--border))',
    borderRadius: '12px',
    background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 82%, white), color-mix(in srgb, var(--card) 96%, transparent))',
  };

  const groupLabelStyle: React.CSSProperties = {
    fontSize: 'var(--font-caption)',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginRight: '2px',
  };

  return (
    <div style={{
      minHeight: '56px',
      background: 'var(--card)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '8px 12px',
      gap: '10px',
      flexWrap: 'wrap',
      flexShrink: 0,
      zIndex: 10
    }}>
      <a
        href="app.html"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '12px', textDecoration: 'none', color: 'inherit' }}
        title="Go to app home"
      >
        <img
          src="mergen-scope-icon.svg"
          alt="Mergen Scope"
          width={20}
          height={20}
          style={{ display: 'block', flexShrink: 0 }}
        />
        <span style={{ fontWeight: 400, fontSize: 'var(--font-title)', letterSpacing: '-0.2px', color: 'var(--tr0)' }}>
          Mergen <span style={{ color: 'var(--accent)' }}>Scope</span>
        </span>
        <span style={{ fontSize: 'var(--font-caption)', color: 'var(--dim)', background: 'var(--bg)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 400 }}>
          v2.0-TS
        </span>
      </a>

      {hasData && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', flex: '1 1 820px', minWidth: 0 }}>
          <div style={groupStyle}>
            <span style={groupLabelStyle}>Panels</span>
            <Btn active={showSidebar} soft color="#6f8fd6" title="Toggle sidebar" onClick={() => handleToggle('showSidebar', showSidebar)}>Left</Btn>
            <Btn active={showRightPanel} soft color="#d78a73" title="Toggle right panel" onClick={() => handleToggle('showRightPanel', showRightPanel)}>Right</Btn>
          </div>

          <div style={groupStyle}>
            <span style={groupLabelStyle}>Workbench</span>
            <Btn active={showPaneTools} color="var(--pane-color)" title="Toggle pane tools" onClick={() => handleToggle('showPaneTools', showPaneTools)}>Pane</Btn>
            <Btn active={showMarkerTools} color="var(--marker-color)" title="Toggle marker tools" onClick={() => handleToggle('showMarkerTools', showMarkerTools)}>Marker</Btn>
            <Btn active={showSearchTools} color="var(--search-color)" title="Toggle search tools" onClick={() => handleToggle('showSearchTools', showSearchTools)}>Search</Btn>
            <Btn active={showLineTools} color="var(--lines-color)" title="Toggle reference line tools" onClick={() => handleToggle('showLineTools', showLineTools)}>Lines</Btn>
            <Btn active={showViewTools} color="var(--view-color)" title="Toggle view tools" onClick={() => handleToggle('showViewTools', showViewTools)}>View</Btn>
            <Btn active={showDots} color="var(--dots-color)" title="Toggle plotted sample dots" onClick={() => handleToggle('showDots', showDots)}>Dots</Btn>
          </div>

          <div style={groupStyle}>
            <span style={groupLabelStyle}>Reset</span>
            <Btn title="Remove all loaded files and clear state" onClick={handleClearAll}>Clear All</Btn>
          </div>
        </div>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', ...groupStyle }}>
        <span style={groupLabelStyle}>Workspace</span>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".json"
          onChange={(e) => {
            if (e.target.files?.[0]) loadFromFile(e.target.files[0]);
            e.target.value = '';
          }}
        />
        <Btn onClick={() => fileInputRef.current?.click()} title="Load Workspace JSON">Load</Btn>
        <Btn onClick={() => downloadWorkspace()} title="Save Workspace JSON">Save</Btn>
      </div>
    </div>
  );
}
