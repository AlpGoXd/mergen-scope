import { useEffect, useMemo } from 'react';
import { usePaneDispatch, usePaneState } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useMarkerDispatch, useMarkerState } from '../../stores/marker-store';
import { useRefLineDispatch } from '../../stores/ref-line-store';
import { useUiState } from '../../stores/ui-store';
import { useLinkedHoverFrequency, useSharedHoverPublisher } from '../../stores/shared-hover-store';
import { useTraceColors } from '../../hooks/use-trace-colors';
import { useTraceSymbols } from '../../hooks/use-trace-symbols';
import { canRenderInPane } from '../../domain/pane-placement';
import { allocateTraceColors, traceWidth } from '../../domain/trace-palette';
import { linkedPeers, paneXUnits } from '../../domain/x-link';
import { smithLinkedBand, smithLinkedPaneLabel, smithMarkerFrequency, smithTraceSamples, smithRangeModel } from '../../domain/smith-pane-model';
import { placeMarker } from '../../domain/markers';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { SmithPane } from './SmithPane';
import type { ExportView } from '../chart/export/export-context';

/** `exportView`: image export render (fixed size, no cursor, selection, range bar or shared hover). */
export function SmithPaneContainer({ paneId, fitRequest = 0, exportView }: { paneId: string; fitRequest?: number; exportView?: ExportView }) {
  const isExport = exportView !== undefined;
  const { panes, tracePaneMap, paneXZooms } = usePaneState();
  const paneDispatch = usePaneDispatch();
  const { allTraces, allKnownTraces, allDisplayTraces, vis } = useTraceState();
  const { traceHueSlots } = useUiState();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const publish = useSharedHoverPublisher();
  // The crosshair shows across every Hz pane, linked or not.
  const linkedCursorHz = useLinkedHoverFrequency(paneId, true);
  const cursorFrequencyHz = isExport ? null : linkedCursorHz;
  // The export copy shares the pane id: it must never clear the real pane's hover.
  useEffect(() => isExport ? undefined : () => publish(null, paneId), [publish, paneId, isExport]);
  const markerDispatch = useMarkerDispatch();
  const historyDispatch = useOptionalAggregateWorkspace()?.historyDispatch;
  const lineDispatch = useRefLineDispatch();
  const color = useTraceColors(exportView?.colorTheme);
  const symbol = useTraceSymbols(isExport ? 'always' : undefined);
  const assignments = useMemo(() => allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))), [allKnownTraces, traceHueSlots]);
  const pane = panes.find(item => item.id === paneId);
  const eligible = useMemo(() => pane ? allTraces.filter(trace => (tracePaneMap[trace.name] ?? []).includes(paneId) && vis[trace.name] !== false && canRenderInPane({ trace, paneIds: [paneId], displayTrace: allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) }, pane).allowed) : [], [pane, allTraces, tracePaneMap, paneId, vis, allDisplayTraces]);
  // `symbol` is a new closure on every render; this key changes only when a trace's symbol does.
  const symbolKey = eligible.map(trace => symbol(trace.id) ?? '').join(',');
  const traces = useMemo(() => {
    let z0: number | undefined;
    return eligible.flatMap(trace => {
      const model = smithTraceSamples(trace, z0);
      if (!model) return [];
      z0 ??= model.z0;
      const assignment = assignments.get(trace.id);
      return [{ traceId: trace.id, name: trace.name, shortName: model.shortName, color: color(trace), created: assignment ? traceWidth(assignment) === 2 : false, symbol: symbol(trace.id), z0: model.z0, samples: model.samples, measured: new Set(model.samples.map(sample => sample.frequencyHz)) }];
    });
  }, [eligible, assignments, color, symbolKey]);
  // Linked to a Hz chart pane: show that pane's visible band. The group shares one zoom; the first chart pane names it.
  const linkedPane = useMemo(() => {
    const peers = new Set(linkedPeers(panes, paneId));
    if (!peers.size) return undefined;
    const units = paneXUnits(panes, allKnownTraces, tracePaneMap);
    return panes.find(candidate => peers.has(candidate.id) && candidate.renderMode === 'cartesian' && units[candidate.id] === 'Hz');
  }, [panes, paneId, allKnownTraces, tracePaneMap]);
  const linkedZoom = linkedPane ? paneXZooms[linkedPane.id] ?? null : null;
  const band = useMemo(() => smithLinkedBand(!!linkedPane, linkedZoom, traces), [linkedPane, linkedZoom, traces]);
  if (!pane) return null;
  const smith = pane.settings.smith;
  const linked = band ? { startHz: band.minHz, stopHz: band.maxHz } : null;
  // While linked, the chart pane decides the range: a fitted chart shows the full range, not the pane's own.
  const model = smithRangeModel(traces, linkedPane ? null : smith.range ?? null, linked, smith.outside ?? 'hidden');
  const setRange = (range: typeof smith.range) => paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: { smith: { ...smith, range } } } });
  return <SmithPane traces={model.traces} markers={markers} selectedMarkerId={isExport ? null : markers[selectedMkrIdx]?.id ?? null}
    {...(exportView ? { size: { width: exportView.width, height: exportView.height }, markScale: exportView.markScale } : {})}
    rangeBar={!isExport && model.full && model.range ? { full: model.full, range: model.range, linkedLabel: linkedPane ? smithLinkedPaneLabel(panes, linkedPane.id) : null, onChange: setRange, onFull: () => setRange(null) } : undefined}
    onSelectMarker={id => { lineDispatch({ type: 'SET_SELECTED', payload: null }); markerDispatch({ type: 'SET_SELECTED_IDX', payload: markers.findIndex(marker => marker.id === id) }); }}
    onTraceClick={click => {
      if (!armed) return;
      const trace = eligible.find(item => item.id === click.traceId);
      if (!trace || (armed.kind === 'delta' && markers.find(item => item.id === armed.refId)?.trace !== trace.name)) return;
      lineDispatch({ type: 'SET_SELECTED', payload: null });
      markerDispatch({ type: 'PLACE_MARKER', payload: { trace, targetFreq: smithMarkerFrequency(trace, click), markerType: armed.kind, refId: armed.kind === 'delta' ? armed.refId : null } });
    }}
    onMoveMarker={(id, to) => {
      // Same rule as a chart drag: the marker stays on its own trace and follows the trace's snap or interpolate setting.
      const idx = markers.findIndex(marker => marker.id === id);
      const trace = eligible.find(item => item.id === to.traceId);
      if (idx < 0 || !trace || markers[idx]?.trace !== trace.name) return;
      const placement = placeMarker(trace, smithMarkerFrequency(trace, to));
      // Starting a gesture twice is a no-op, so every move of one drag lands in the same Undo step.
      historyDispatch?.({ type: 'begin-gesture' });
      markerDispatch({ type: 'UPDATE_MARKER', payload: { idx, updates: { requestedFreq: placement.requestedFreq, freq: placement.freq, amp: placement.amp, interpolated: placement.interpolated } } });
    }}
    onMoveMarkerEnd={() => historyDispatch?.({ type: 'commit-gesture' })}
    band={model.band} cursorFrequencyHz={cursorFrequencyHz}
    onHoverFrequency={value => { if (!isExport) publish(value === null ? null : { paneId, xUnit: 'Hz', value }, paneId); }}
    grid={smith?.grid ?? (pane.renderMode === 'smith-inverted' ? 'y' : 'z')} labels={smith?.labels ?? 'normalised'}
    direction={smith?.direction ?? 'chevrons'} readout={smith?.readout ?? ['z', 'gamma', 'vswr']}
    showMarkers={pane.settings.showMarkers} showMarkerTags={pane.settings.showMarkerLabels} showSamples={pane.settings.showSampleDots} fitRequest={fitRequest} />;
}
