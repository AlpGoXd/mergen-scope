import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './components/layout/TopBar';
import { ToolbarStrip } from './components/layout/ToolbarStrip';
import { Sidebar } from './components/layout/Sidebar';
import { ChartWorkspace } from './components/chart/ChartWorkspace';
import { RightPanelStack } from './components/layout/RightPanelStack';
import { FooterBar } from './components/layout/FooterBar';
import { ImportWizardModal } from './components/wizard/ImportWizardModal';
import { useKeyboard } from './hooks/use-keyboard';
import { useTheme } from './hooks/use-theme';
import { useUiState } from './stores/ui-store';
import { useUiDispatch } from './stores/ui-store';
import { useFileDispatch } from './stores/file-store';
import { useTraceDispatch, useTraceState } from './stores/trace-store';
import { usePaneDispatch, usePaneState } from './stores/pane-store';
import { canAssignTraceToPane } from './domain/pane-math';

function makeId(fileName: string) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
}

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
    selectedTraceName,
    paneAssignmentWarning,
    showSidebar,
    showRightPanel,
  } = useUiState();
  const { allTraces, vis } = useTraceState();
  const traceDispatch = useTraceDispatch();
  const uiDispatch = useUiDispatch();
  const fileDispatch = useFileDispatch();
  const paneDispatch = usePaneDispatch();
  const { panes, activePaneId, tracePaneMap } = usePaneState();

  useEffect(() => {
    const selectedIsVisible = selectedTraceName ? !!vis[selectedTraceName] : false;
    if (selectedIsVisible) {
      return;
    }

    const firstVisible = allTraces.find((trace) => vis[trace.name]);
    if (firstVisible) {
      uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: firstVisible.name } });
    }
  }, [allTraces, selectedTraceName, uiDispatch, vis]);

  const lastActivePaneIdRef = useRef(activePaneId);

  useEffect(() => {
    if (lastActivePaneIdRef.current !== activePaneId && paneAssignmentWarning) {
      uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } });
    }
    lastActivePaneIdRef.current = activePaneId;
  }, [activePaneId, paneAssignmentWarning, uiDispatch]);

  const knownTraceNamesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const known = knownTraceNamesRef.current;
    const newTraces = allTraces.filter((trace) => !known.has(trace.name));

    if (newTraces.length === 0) {
      knownTraceNamesRef.current = new Set(allTraces.map((trace) => trace.name));
      return;
    }

    const nextKnown = new Set(allTraces.map((trace) => trace.name));
    let firstAssignedTraceName: string | null = null;
    let paneCount = panes.length;
    const provisionalPaneDomains = new Map<string, 'time' | 'frequency'>();

    panes.forEach((pane) => {
      const paneTrace = allTraces.find((trace) => (tracePaneMap[trace.name] ?? 'pane-1') === pane.id);
      if (paneTrace) {
        provisionalPaneDomains.set(pane.id, paneTrace.domain);
      }
    });

    for (const trace of newTraces) {
      traceDispatch({ type: 'SET_VISIBILITY', name: trace.name, visible: true });

      let targetPaneId = activePaneId ?? 'pane-1';
      let validation = canAssignTraceToPane(trace, targetPaneId, allTraces, tracePaneMap);

      if (!validation.allowed) {
        const compatiblePane = panes.find((pane) => provisionalPaneDomains.get(pane.id) === trace.domain)
          ?? panes.find((pane) => canAssignTraceToPane(trace, pane.id, allTraces, tracePaneMap).allowed);
        if (compatiblePane) {
          targetPaneId = compatiblePane.id;
          validation = { allowed: true };
        } else if (paneCount < 4) {
          paneCount += 1;
          targetPaneId = `pane-${paneCount}`;
          paneDispatch({ type: 'SET_PANE_COUNT', payload: paneCount });
          provisionalPaneDomains.set(targetPaneId, trace.domain);
          validation = { allowed: true };
        } else {
          const conflictMessage = trace.domain === 'time'
            ? 'Cannot place time-domain traces on a frequency-domain pane'
            : 'Cannot place frequency-domain traces on a time-domain pane';
          uiDispatch({
            type: 'SET',
            payload: {
              key: 'paneAssignmentWarning',
              value: {
                message: conflictMessage,
                paneId: targetPaneId,
                traceName: trace.name,
              },
            },
          });
          continue;
        }
      }

      if (validation.allowed) {
        provisionalPaneDomains.set(targetPaneId, trace.domain);
        uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } });
        paneDispatch({
          type: 'ASSIGN_TRACE_TO_PANE',
          payload: { trace, targetPaneId, allTraces },
        });
        paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId: targetPaneId, traceName: trace.name } });
        paneDispatch({ type: 'SET_ACTIVE_PANE', payload: targetPaneId });
        firstAssignedTraceName ??= trace.name;
      }
    }

    if (firstAssignedTraceName) {
      uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: firstAssignedTraceName } });
    }

    knownTraceNamesRef.current = nextKnown;
  }, [activePaneId, allTraces, paneDispatch, panes, traceDispatch, tracePaneMap, uiDispatch]);

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

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) {
      return;
    }
    dragCounter.current++;
    if (e.dataTransfer.items.length > 0) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) {
      return;
    }
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files') && dragging) {
      resetDragOverlay();
    }
  }, [dragging, resetDragOverlay]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    resetDragOverlay();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) {
      return;
    }
    for (const file of files) {
      const rawText = await file.text();
      fileDispatch({
        type: 'QUEUE_WIZARD',
        payload: { id: makeId(file.name), fileName: file.name, rawText },
      });
    }
  }, [fileDispatch, resetDragOverlay]);

  const handleDropCapture = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Capture phase guarantees this runs before child handlers that may stop propagation.
    resetDragOverlay();
  }, [resetDragOverlay]);

  return (
    <div
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
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDropCapture={handleDropCapture}
      onDrop={handleDrop}
    >
      {dragging && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          border: '2px dashed var(--accent)',
          borderRadius: 4,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.25rem',
          fontWeight: 400,
          color: 'var(--accent)',
          pointerEvents: 'none',
          gap: '0.5rem',
        }}>
          Drop files to load
        </div>
      )}

      <TopBar />
      <ToolbarStrip />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
        {showSidebar && <Sidebar width={leftPanelWidth} />}
        {showSidebar && <PanelResizeHandle side="left" onMouseDown={startResize('left')} />}
        <ChartWorkspace />
        {showRightPanel && <PanelResizeHandle side="right" onMouseDown={startResize('right')} />}
        <RightPanelStack width={rightPanelWidth} />
      </div>

      <FooterBar />

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

