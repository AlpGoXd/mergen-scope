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
import { useFileState } from './stores/file-store';
import { useFileImport } from './hooks/use-file-import';
import { useTraceDispatch, useTraceState } from './stores/trace-store';
import { usePaneDispatch, usePaneState } from './stores/pane-store';
import { canAssignTraceToPane } from './domain/pane-math';


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
  const importFiles = useFileImport();
  const { files } = useFileState();
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

    const traceTargetPane: Record<string, string> = {};
    const traceFileName: Record<string, string> = {};
    files.forEach(f => {
      if (f.targetPaneId) f.traces.forEach(t => { traceTargetPane[t.name] = f.targetPaneId ?? ''; traceFileName[t.name] = f.fileName ?? t.name; });
    });

    let conflictWarning: { message: string; paneId: string; traceName: string } | null = null;

    for (const trace of newTraces) {
      // Already placed (e.g. restored from a workspace): keep the saved pane and visibility.
      if (tracePaneMap[trace.name]) {
        continue;
      }
      traceDispatch({ type: 'SET_VISIBILITY', name: trace.name, visible: true });

      let targetPaneId = traceTargetPane[trace.name] ?? activePaneId ?? 'pane-1';
      let validation = provisionalPaneDomains.has(targetPaneId)
        ? { allowed: provisionalPaneDomains.get(targetPaneId) === trace.domain }
        : canAssignTraceToPane(trace, targetPaneId, allTraces, tracePaneMap);

      if (!validation.allowed) {
        const originalPaneId = targetPaneId;
        const originalDomain = provisionalPaneDomains.get(originalPaneId) ?? (trace.domain === 'time' ? 'frequency' : 'time');
        // provisionalPaneDomains also holds panes created earlier in this loop (not yet in `panes`).
        const compatiblePaneId = Array.from(provisionalPaneDomains).find(([, domain]) => domain === trace.domain)?.[0]
          ?? panes.find((pane) => !provisionalPaneDomains.has(pane.id) && canAssignTraceToPane(trace, pane.id, allTraces, tracePaneMap).allowed)?.id;
        if (compatiblePaneId) {
          targetPaneId = compatiblePaneId;
          validation = { allowed: true };
        } else if (paneCount < 4) {
          paneCount += 1;
          targetPaneId = `pane-${paneCount}`;
          paneDispatch({ type: 'SET_PANE_COUNT', payload: paneCount });
          provisionalPaneDomains.set(targetPaneId, trace.domain);
          validation = { allowed: true };
        } else {
          conflictWarning ??= {
            message: trace.domain === 'time'
              ? 'Cannot place time-domain traces on a frequency-domain pane'
              : 'Cannot place frequency-domain traces on a time-domain pane',
            paneId: targetPaneId,
            traceName: trace.name,
          };
          continue;
        }
        if (traceTargetPane[trace.name]) {
          conflictWarning ??= {
            message: `${traceFileName[trace.name] ?? trace.name} was placed on Pane ${targetPaneId.split('-')[1]}: Pane ${originalPaneId.split('-')[1]} holds ${originalDomain}-domain traces.`,
            paneId: originalPaneId,
            traceName: trace.name,
          };
        }
      }

      if (validation.allowed) {
        provisionalPaneDomains.set(targetPaneId, trace.domain);
        paneDispatch({
          type: 'ASSIGN_TRACE_TO_PANE',
          payload: { trace, targetPaneId, allTraces },
        });
        paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId: targetPaneId, traceName: trace.name } });
        lastActivePaneIdRef.current = targetPaneId;
        paneDispatch({ type: 'SET_ACTIVE_PANE', payload: targetPaneId });
        firstAssignedTraceName ??= trace.name;
      }
    }

    if (firstAssignedTraceName) {
      uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: firstAssignedTraceName } });
    }
    // One message per batch: a later successful trace must not erase an earlier conflict.
    if (conflictWarning || firstAssignedTraceName) {
      uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: conflictWarning } });
    }

    knownTraceNamesRef.current = nextKnown;
  }, [activePaneId, allTraces, files, paneDispatch, panes, traceDispatch, tracePaneMap, uiDispatch]);

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
        fontFamily: 'system-ui, -apple-system, sans-serif'
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
          fontSize: '1.25rem',
          fontWeight: 400,
          color: 'var(--accent)',
          pointerEvents: 'none',
          gap: '0.5rem',
        }}>
          <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '4px 8px' }}>Drop files to load</span>
        </div>
      )}

      <TopBar />
      <ToolbarStrip />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
        {/* Always mounted (renders nothing when hidden): it owns the Touchstone trace reconciliation. */}
        <Sidebar width={leftPanelWidth} />
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
