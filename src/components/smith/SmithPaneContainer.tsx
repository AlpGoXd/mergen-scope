import { useEffect, useMemo } from 'react';
import { usePaneState } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { useMarkerDispatch, useMarkerState } from '../../stores/marker-store';
import { useRefLineDispatch } from '../../stores/ref-line-store';
import { useUiState } from '../../stores/ui-store';
import { useLinkedHoverFrequency, useSharedHoverPublisher } from '../../stores/shared-hover-store';
import { useTraceColors } from '../../hooks/use-trace-colors';
import { canRenderInPane } from '../../domain/pane-placement';
import { allocateTraceColors, traceWidth } from '../../domain/trace-palette';
import { smithLinkedBand, smithMarkerFrequency, smithTraceSamples } from '../../domain/smith-pane-model';
import { SmithPane } from './SmithPane';

export function SmithPaneContainer({ paneId, fitRequest = 0 }: { paneId: string; fitRequest?: number }) {
  const { panes, tracePaneMap, zoomAll, sharedZoom } = usePaneState();
  const { allTraces, allKnownTraces, allDisplayTraces, vis } = useTraceState();
  const { traceHueSlots } = useUiState();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const publish = useSharedHoverPublisher();
  const cursorFrequencyHz = useLinkedHoverFrequency(paneId, zoomAll);
  useEffect(() => () => publish(null, paneId), [publish, paneId]);
  const markerDispatch = useMarkerDispatch();
  const lineDispatch = useRefLineDispatch();
  const color = useTraceColors();
  const assignments = useMemo(() => allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))), [allKnownTraces, traceHueSlots]);
  const pane = panes.find(item => item.id === paneId);
  const eligible = useMemo(() => pane ? allTraces.filter(trace => (tracePaneMap[trace.name] ?? []).includes(paneId) && vis[trace.name] !== false && canRenderInPane({ trace, paneIds: [paneId], displayTrace: allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) }, pane).allowed) : [], [pane, allTraces, tracePaneMap, paneId, vis, allDisplayTraces]);
  const traces = useMemo(() => {
    let z0: number | undefined;
    return eligible.flatMap(trace => {
      const model = smithTraceSamples(trace, z0);
      if (!model) return [];
      z0 ??= model.z0;
      const assignment = assignments.get(trace.id);
      return [{ traceId: trace.id, name: trace.name, shortName: model.shortName, color: color(trace), created: assignment ? traceWidth(assignment) === 2 : false, z0: model.z0, samples: model.samples }];
    });
  }, [eligible, assignments, color]);
  const band = useMemo(() => smithLinkedBand(zoomAll, sharedZoom, traces), [zoomAll, sharedZoom, traces]);
  if (!pane) return null;
  const smith = pane.settings.smith;
  return <SmithPane traces={traces} markers={markers} selectedMarkerId={markers[selectedMkrIdx]?.id ?? null}
    onSelectMarker={id => { lineDispatch({ type: 'SET_SELECTED', payload: null }); markerDispatch({ type: 'SET_SELECTED_IDX', payload: markers.findIndex(marker => marker.id === id) }); }}
    onTraceClick={click => {
      if (!armed) return;
      const trace = eligible.find(item => item.id === click.traceId);
      if (!trace || (armed.kind === 'delta' && markers.find(item => item.id === armed.refId)?.trace !== trace.name)) return;
      lineDispatch({ type: 'SET_SELECTED', payload: null });
      markerDispatch({ type: 'PLACE_MARKER', payload: { trace, targetFreq: smithMarkerFrequency(trace, click), markerType: armed.kind, refId: armed.kind === 'delta' ? armed.refId : null } });
    }}
    band={band} cursorFrequencyHz={cursorFrequencyHz}
    onHoverFrequency={value => publish(value === null ? null : { paneId, xUnit: 'Hz', value }, paneId)}
    grid={smith?.grid ?? (pane.renderMode === 'smith-inverted' ? 'y' : 'z')} labels={smith?.labels ?? 'normalised'}
    direction={smith?.direction ?? 'chevrons'} readout={smith?.readout ?? ['z', 'gamma', 'vswr']}
    showMarkers={pane.settings.showMarkers} showMarkerTags={pane.settings.showMarkerLabels} fitRequest={fitRequest} />;
}
