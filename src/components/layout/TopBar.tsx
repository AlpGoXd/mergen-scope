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
    showMarkerTools,
    showPaneTools,
    showSearchTools,
    showLineTools,
    showViewTools,
    showDots,
    showDT,
    showAnalysisPanel,
    showTraceOps,
    showImportExportPanel
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

  const dotSep = (key: string) => (
    <span key={key} style={{ color: 'var(--dim)', fontSize: '14px', lineHeight: 1, padding: '0 2px', userSelect: 'none' }}>
      &middot;
    </span>
  );

  const handleToggle = (key: keyof UiState, currentVal: boolean) => {
    uiDispatch({ type: 'SET', payload: { key, value: !currentVal } });
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

  return (
    <div style={{
      height: '44px',
      background: 'var(--card)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: '6px',
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
        <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.2px', color: 'var(--tr0)' }}>
          Mergen <span style={{ color: 'var(--accent)' }}>Scope</span>
        </span>
        <span style={{ fontSize: '10px', color: 'var(--dim)', background: 'var(--bg)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
          v2.0-TS
        </span>
      </a>

      {hasData && (
        <>
          <Btn
            active={showImportExportPanel}
            soft
            color="#b7dfc8"
            title="Toggle import/export panel"
            onClick={() => handleToggle('showImportExportPanel', showImportExportPanel)}
          >
            Import / Export
          </Btn>
          {dotSep('s1')}
          <Btn
            active={showSidebar}
            soft
            color="#c7cfe8"
            title="Toggle sidebar"
            onClick={() => handleToggle('showSidebar', showSidebar)}
          >
            Panel
          </Btn>
          <Btn
            active={showRightPanel}
            soft
            color="#e8b4a8"
            title="Toggle right panel"
            onClick={() => handleToggle('showRightPanel', showRightPanel)}
          >
            Right Panel
          </Btn>
          <Btn
            active={showMarkerTools}
            soft
            color="#d7ae63"
            title="Toggle marker tools"
            onClick={() => handleToggle('showMarkerTools', showMarkerTools)}
          >
            Marker
          </Btn>
          <Btn
            active={showPaneTools}
            soft
            color="#e69473"
            title="Toggle pane tools"
            onClick={() => handleToggle('showPaneTools', showPaneTools)}
          >
            Pane
          </Btn>
          <Btn
            active={showSearchTools}
            soft
            color="#7eb2da"
            title="Toggle search tools"
            onClick={() => handleToggle('showSearchTools', showSearchTools)}
          >
            Search
          </Btn>
          <Btn
            active={showLineTools}
            soft
            color="#d8ac7a"
            title="Toggle reference line tools"
            onClick={() => handleToggle('showLineTools', showLineTools)}
          >
            Lines
          </Btn>
          <Btn
            active={showViewTools}
            soft
            color="#8db7df"
            title="Toggle view tools"
            onClick={() => handleToggle('showViewTools', showViewTools)}
          >
            View
          </Btn>
          {dotSep('s2')}
          <Btn
            active={showAnalysisPanel}
            soft
            color="#e7b2a5"
            title="Toggle analysis panel"
            onClick={() => handleToggle('showAnalysisPanel', showAnalysisPanel)}
          >
            Analysis
          </Btn>
          <Btn
            active={showDots}
            soft
            color="#d7c2ef"
            title="Toggle plotted sample dots"
            onClick={() => handleToggle('showDots', showDots)}
          >
            Dots
          </Btn>
          <Btn
            active={showDT}
            soft
            color="#f3a6c8"
            title="Toggle data table"
            onClick={() => handleToggle('showDT', showDT)}
          >
            Data
          </Btn>
          <Btn
            active={showTraceOps}
            soft
            color="#d9b8eb"
            title="Toggle trace operations"
            onClick={() => handleToggle('showTraceOps', showTraceOps)}
          >
            Trace Ops
          </Btn>

          {dotSep('s3')}
          {dotSep('s4')}
          <Btn
            color="#efb0ab"
            soft
            title="Remove all loaded files and clear state"
            onClick={handleClearAll}
          >
            Clear All
          </Btn>
        </>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
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
