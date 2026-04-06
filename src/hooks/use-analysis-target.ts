import { useMemo } from 'react';
import { usePaneState } from '../stores/pane-store';
import { useTraceState } from '../stores/trace-store';
import { useAnalysisState } from '../stores/analysis-store';
import { useFileState } from '../stores/file-store';
import { useUiState } from '../stores/ui-store';
import { resolveAnalysisTarget, makeAnalysisRegistry } from '../domain/analysis/registry';

/**
 * Hook for resolving the current analysis target and registry.
 * This is a composed hook that coordinates state from multiple stores.
 */
export function useAnalysisTarget() {
  const { activePaneId, paneActiveTraceMap, paneXZooms, sharedZoom, zoomAll } = usePaneState();
  const { allTraces } = useTraceState();
  const { files } = useFileState();
  const { vis } = useUiState() as any; // Global visibility map
  const { openState, noiseResults, ip3Results } = useAnalysisState();

  // 1. Resolve active pane zoom
  const zoom = zoomAll ? sharedZoom : (activePaneId ? (paneXZooms[activePaneId] || null) : null);

  // 2. Filter traces for the active pane
  const { tracePaneMap } = usePaneState(); // Need this to find which traces are in which pane
  const paneTraces = useMemo(() => {
    const pId = activePaneId || 'pane-1';
    return allTraces.filter(tr => (tracePaneMap[tr.name] || 'pane-1') === pId && (!vis || vis[tr.name]));
  }, [allTraces, activePaneId, tracePaneMap, vis]);

  // 3. Get active trace for the pane
  const activeTraceName = activePaneId ? (paneActiveTraceMap[activePaneId] || null) : null;

  // 4. Resolve the analysis target
  const target = useMemo(() => {
    return resolveAnalysisTarget({
      paneId: activePaneId || 'pane-1',
      paneTraces,
      activeTraceName,
      zoom,
      files
    });
  }, [activePaneId, paneTraces, activeTraceName, zoom, files]);

  // 5. Aggregate result counts for the registry
  const resultCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (noiseResults) counts['noise-psd'] = 1; // Or array length if multiple
    if (ip3Results) counts['ip3'] = 1;
    // ... add more as implemented
    return counts;
  }, [noiseResults, ip3Results]);

  // 6. Build the registry
  const registry = useMemo(() => {
    return makeAnalysisRegistry(openState, resultCounts, { target });
  }, [openState, resultCounts, target]);

  return {
    target,
    registry,
    openState,
    paneTraces,
    activeTraceName
  };
}
