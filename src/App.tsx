import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './components/layout/TopBar';
import { ToolbarStrip } from './components/layout/ToolbarStrip';
import { Sidebar } from './components/layout/Sidebar';
import { ChartWorkspace } from './components/chart/ChartWorkspace';
import { LineCrossingsContext } from './components/analysis/line-crossings-context';
import { useAnalysisDispatch, useAnalysisState } from './stores/analysis-store';
import { RightPanelStack } from './components/layout/RightPanelStack';
import { FooterBar } from './components/layout/FooterBar';
import { ImportWizardModal } from './components/wizard/ImportWizardModal';
import { useKeyboard } from './hooks/use-keyboard';
import { useTheme } from './hooks/use-theme';
import { useUiState } from './stores/ui-store';
import { useUiDispatch } from './stores/ui-store';
import { DATA_FILE_ACCEPT, useFileImport } from './hooks/use-file-import';
import { usePaneState } from './stores/pane-store';
import { useAggregateWorkspace } from './stores/aggregate-workspace-store';
import { loadDemoWorkspace } from './demo/demo-loader';
import { ExportImageProvider } from './components/chart/export/ExportImageProvider';
import { useShortcut } from './stores/shortcut-store';
import { useWorkspace } from './hooks/use-workspace';


function clampLeftPanelWidth(width: number, viewportWidth: number) {
  return Math.max(200, Math.min(width, Math.min(560, viewportWidth * 0.45)));
}

function clampRightPanelWidth(width: number, viewportWidth: number) {
  return Math.max(220, Math.min(width, Math.min(600, viewportWidth * 0.45)));
}

/**
 * Main application shell.
 * Store providers are mounted in main.tsx.
 */
export function App() {
  // Activate global keyboard shortcuts
  useKeyboard();

  // Activate theme and color tokens
  useTheme();
  const {
    theme,
    paneAssignmentWarning,
    showSidebar,
    showRightPanel,
  } = useUiState();
  const uiDispatch = useUiDispatch();
  const analysisDispatch = useAnalysisDispatch();
  const { analyses } = useAnalysisState();
  const importFiles = useFileImport();
  const { dispatch: workspaceDispatch } = useAggregateWorkspace();
  const loadDemo = useCallback(async () => {
    try {
      const text = await loadDemoWorkspace();
      await importFiles([new File([text], 'demo.json', { type: 'application/json' })], undefined, true);
    } catch {
      workspaceDispatch({ slice: 'files', action: { type: 'REPORT_IMPORT_ERROR', payload: { fileName: 'Demo', message: 'The demo could not be loaded. Open the app from the website, or open demo.json from the demo-assets folder.' } } });
    }
  }, [importFiles, workspaceDispatch]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('demo') !== '1') return;
    url.searchParams.delete('demo');
    window.history.replaceState(window.history.state, '', url.href);
    void loadDemo();
  }, [loadDemo]);
  const sidebarFileInput = useRef<HTMLInputElement>(null);
  const { downloadWorkspace } = useWorkspace();
  useShortcut('open', () => { sidebarFileInput.current?.click(); });
  useShortcut('save', () => { downloadWorkspace(); });
  const { activePaneId } = usePaneState();

  const lastActivePaneIdRef = useRef(activePaneId);

  useEffect(() => {
    if (lastActivePaneIdRef.current !== activePaneId && paneAssignmentWarning) {
      uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } });
    }
    lastActivePaneIdRef.current = activePaneId;
  }, [activePaneId, paneAssignmentWarning, uiDispatch]);

  const [dragging, setDragging] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => clampLeftPanelWidth(300, typeof window === 'undefined' ? 1440 : window.innerWidth));
  const [rightPanelWidth, setRightPanelWidth] = useState(() => clampRightPanelWidth(280, typeof window === 'undefined' ? 1440 : window.innerWidth));
  const resizingSideRef = useRef<'left' | 'right' | null>(null);
  const dragCounter = useRef(0);

  const resetDragOverlay = useCallback(() => {
    dragCounter.current = 0;
    setDragging(false);
  }, []);

  useEffect(() => {
    const clearOverlay = () => resetDragOverlay();
    window.addEventListener('drop', clearOverlay);
    window.addEventListener('dragend', clearOverlay);
    return () => {
      window.removeEventListener('drop', clearOverlay);
      window.removeEventListener('dragend', clearOverlay);
    };
  }, [resetDragOverlay]);

  useEffect(() => {
    const handleResize = () => {
      setLeftPanelWidth((current) => clampLeftPanelWidth(current, window.innerWidth));
      setRightPanelWidth((current) => clampRightPanelWidth(current, window.innerWidth));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (resizingSideRef.current === 'left') {
        setLeftPanelWidth(clampLeftPanelWidth(event.clientX, window.innerWidth));
      } else if (resizingSideRef.current === 'right') {
        setRightPanelWidth(clampRightPanelWidth(window.innerWidth - event.clientX, window.innerWidth));
      }
    };

    const handlePointerUp = () => {
      resizingSideRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, []);

  const startResize = useCallback((side: 'left' | 'right') => (event: React.MouseEvent) => {
    event.preventDefault();
    resizingSideRef.current = side;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Counting in the capture phase sees every enter/leave even when panes stop propagation.
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) {
      return;
    }
    dragCounter.current += 1;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) {
      return;
    }
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files') && dragging) {
      resetDragOverlay();
    }
  }, [dragging, resetDragOverlay]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    resetDragOverlay();
    if (e.dataTransfer.files.length > 0) {
      void importFiles(e.dataTransfer.files);
    }
  }, [importFiles, resetDragOverlay]);

  const handleDropCapture = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Capture phase guarantees this runs before child handlers that may stop propagation.
    resetDragOverlay();
  }, [resetDragOverlay]);

  // A line's List... adds its "V1 crossings" card (or shows the existing one) and opens the right panel.
  const listCrossings = (lineId: number) => {
    uiDispatch({ type: 'SET', payload: { key: 'showRightPanel', value: true } });
    const existing = analyses.find(item => item.toolId === 'line-crossings' && item.source.lineId === lineId);
    if (existing) { if (existing.collapsed) analysisDispatch({ type: 'SET_ANALYSIS_COLLAPSED', payload: { id: existing.id, collapsed: false } }); return; }
    analysisDispatch({ type: 'ADD_ANALYSIS', payload: { toolId: 'line-crossings', source: { traceId: null, lineId } } });
  };

  return (
    <div
      data-testid="app-root"
      className={`app-root theme-${theme}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-sans)'
      }}
      onDragEnterCapture={handleDragEnter}
      onDragLeaveCapture={handleDragLeave}
      onDragOver={handleDragOver}
      onDropCapture={handleDropCapture}
      onDrop={handleDrop}
    >
      {dragging && (
        <div style={{
          position: 'absolute',
          inset: 4,
          border: '2px dashed var(--accent)',
          borderRadius: 4,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          fontSize: 'var(--font-title)',
          color: 'var(--accent)',
          pointerEvents: 'none',
          gap: '0.5rem',
        }}>
          <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '4px 8px' }}>Drop files to load</span>
        </div>
      )}

      <ExportImageProvider>
      <TopBar />
      <ToolbarStrip />

      <LineCrossingsContext.Provider value={{ listCrossings }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
        {/* Always mounted (renders nothing when hidden): it owns the Touchstone trace reconciliation. */}
        <input data-testid="app-open-input" ref={sidebarFileInput} type="file" accept={DATA_FILE_ACCEPT} multiple hidden onChange={event => { if (event.target.files?.length) void importFiles(event.target.files); event.target.value = ''; }} />
        <Sidebar width={leftPanelWidth} onLoadDemo={() => void loadDemo()} onOpenFiles={() => sidebarFileInput.current?.click()} onThresholdCrossings={listCrossings} />
        {showSidebar && <PanelResizeHandle side="left" onMouseDown={startResize('left')} />}
        <ChartWorkspace />
        {showRightPanel && <PanelResizeHandle side="right" onMouseDown={startResize('right')} />}
        <RightPanelStack width={rightPanelWidth} />
      </div>
      </LineCrossingsContext.Provider>

      <FooterBar />
      </ExportImageProvider>

      <ImportWizardModal />
    </div>
  );
}

function PanelResizeHandle({ side, onMouseDown }: { side: 'left' | 'right'; onMouseDown: (event: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel`}
      style={{
        width: '6px',
        cursor: 'col-resize',
        background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
        borderLeft: side === 'right' ? '1px solid color-mix(in srgb, var(--accent) 8%, transparent)' : 'none',
        borderRight: side === 'left' ? '1px solid color-mix(in srgb, var(--accent) 8%, transparent)' : 'none',
        flexShrink: 0,
      }}
    />
  );
}
