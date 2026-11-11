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
import { smithLinkedBand, smithLinkedPaneLabel, smithMarkerFrequency, smithTraceSamples, smithRangeModel } from '../../domain/smith-pane-model';
import { SmithPane } from './SmithPane';

export function SmithPaneContainer({ paneId, fitRequest = 0 }: { paneId: string; fitRequest?: number }) {
  const { panes, tracePaneMap, zoomAll, sharedZoom } = usePaneState();
  const paneDispatch = usePaneDispatch();
  const { allTraces, allKnownTraces, allDisplayTraces, vis } = useTraceState();
  const { traceHueSlots } = useUiState();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const publish = useSharedHoverPublisher();
  const cursorFrequencyHz = useLinkedHoverFrequency(paneId, zoomAll);
  useEffect(() => () => publish(null, paneId), [publish, paneId]);
  const markerDispatch = useMarkerDispatch();
  const lineDispatch = useRefLineDispatch();
  const color = useTraceColors();
  const symbol = useTraceSymbols();
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
  const band = useMemo(() => smithLinkedBand(zoomAll, sharedZoom, traces), [zoomAll, sharedZoom, traces]);
  if (!pane) return null;
  const smith = pane.settings.smith;
  // A shared zoom may have several Hz panes; use the lowest pane number as its stable label.
  const linkedPane = band ? panes.find(candidate => candidate.id !== paneId && candidate.renderMode === 'cartesian' && allTraces.some(trace => (tracePaneMap[trace.name] ?? []).includes(candidate.id) && vis[trace.name] !== false && trace.domain === 'frequency')) : undefined;
  const linked = linkedPane && band ? { startHz: band.minHz, stopHz: band.maxHz } : null;
  const model = smithRangeModel(traces, smith.range ?? null, linked, smith.outside ?? 'hidden');
  const setRange = (range: typeof smith.range) => paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: { smith: { ...smith, range } } } });
  return <SmithPane traces={model.traces} markers={markers} selectedMarkerId={markers[selectedMkrIdx]?.id ?? null}
    rangeBar={model.full && model.range ? { full: model.full, range: model.range, linkedLabel: linkedPane ? smithLinkedPaneLabel(panes, linkedPane.id) : null, onChange: setRange, onFull: () => setRange(null) } : undefined}
    onSelectMarker={id => { lineDispatch({ type: 'SET_SELECTED', payload: null }); markerDispatch({ type: 'SET_SELECTED_IDX', payload: markers.findIndex(marker => marker.id === id) }); }}
    onTraceClick={click => {
      if (!armed) return;
      const trace = eligible.find(item => item.id === click.traceId);
      if (!trace || (armed.kind === 'delta' && markers.find(item => item.id === armed.refId)?.trace !== trace.name)) return;
      lineDispatch({ type: 'SET_SELECTED', payload: null });
      markerDispatch({ type: 'PLACE_MARKER', payload: { trace, targetFreq: smithMarkerFrequency(trace, click), markerType: armed.kind, refId: armed.kind === 'delta' ? armed.refId : null } });
    }}
    band={model.band} cursorFrequencyHz={cursorFrequencyHz}
    onHoverFrequency={value => publish(value === null ? null : { paneId, xUnit: 'Hz', value }, paneId)}
    grid={smith?.grid ?? (pane.renderMode === 'smith-inverted' ? 'y' : 'z')} labels={smith?.labels ?? 'normalised'}
    direction={smith?.direction ?? 'chevrons'} readout={smith?.readout ?? ['z', 'gamma', 'vswr']}
    showMarkers={pane.settings.showMarkers} showMarkerTags={pane.settings.showMarkerLabels} showSamples={pane.settings.showSampleDots} fitRequest={fitRequest} />;
}
