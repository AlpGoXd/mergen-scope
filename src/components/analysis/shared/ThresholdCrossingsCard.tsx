import { createContext, useContext, useMemo, useState } from 'react';
import { computeLineIntersections } from '../../../domain/ref-lines';
import { findThresholdCrossings } from '../../../domain/analysis/threshold';
import { formatCrossingValue, lineCrossingRows, manualCrossingRows, significantStep } from '../../../domain/analysis/crossing-rows';
import { parseEngInput } from '../../../domain/format';
import { useRefLineState } from '../../../stores/ref-line-store';
import { usePaneState } from '../../../stores/pane-store';
import { useUiState } from '../../../stores/ui-store';
import { useTraceState } from '../../../stores/trace-store';
import { useAnalysisDispatch } from '../../../stores/analysis-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';
import { CrossingsView } from './CrossingsView';

/** `listCrossings` opens the "V1 crossings" card for a line (App provides it; used by the sidebar row and the chart's context menu). */
export const LineCrossingsContext = createContext<{ lineId: number | null; setLineId: (id: number | null) => void; listCrossings?: (lineId: number) => void }>({ lineId: null, setLineId: () => {} });

export function ThresholdCrossingsCard() {
  const { lineId, setLineId } = useContext(LineCrossingsContext);
  const { refLines } = useRefLineState();
  const { panes, tracePaneMap } = usePaneState();
  const { vis, allTraces } = useTraceState();
  const { selectedTraceName } = useUiState();
  const dispatch = useAnalysisDispatch();
  const [thresholdText, setThresholdText] = useState('0');
  const line = refLines.find(item => item.id === lineId);
  const selectedTrace = allTraces.find(trace => trace.name === selectedTraceName) ?? null;
  const parsed = parseEngInput(thresholdText, { baseUnit: selectedTrace?.units.y ?? undefined });
  const threshold = parsed.ok ? parsed.value : null;
  const crossings = useMemo(() => selectedTrace && threshold !== null ? findThresholdCrossings(selectedTrace.data, threshold) : [], [selectedTrace, threshold]);
  const lineCrossings = useMemo(() => line ? computeLineIntersections(line, refLines, allTraces, tracePaneMap, vis) : [], [line, refLines, allTraces, tracePaneMap, vis]);
  const units = Object.fromEntries(allTraces.map(trace => [trace.name, { xUnit: trace.units.x, yUnit: trace.units.y }]));
  const paneTitles = Object.fromEntries(panes.map((pane, index) => [pane.id, pane.title || `Pane ${index + 1}`]));
  const traceLabels = Object.fromEntries(allTraces.map(trace => [trace.name, trace.dn || trace.name]));
  const selectedLabel = selectedTrace ? (selectedTrace.dn || selectedTrace.name) : '';
  const lineMode = lineId !== null;
  const lineName = line ? String(line.label || line.id) : '';
  const source = lineMode ? (line ? '' : 'Line removed') : (selectedLabel || 'No trace');
  // The line's own value is shown in the units of the first trace it crosses (the selected trace if none).
  const refTrace = allTraces.find(trace => trace.name === lineCrossings[0]?.traceName) ?? selectedTrace;
  const sourceLine = lineMode
    ? (line
      ? `${line.type === 'v' ? 'Vertical' : 'Horizontal'} line ${lineName}: ${formatCrossingValue(line.value, line.type === 'v' ? refTrace?.units.x : refTrace?.units.y, significantStep(line.value, 6))}`
      : 'Line no longer exists.')
    : (selectedTrace ? `${selectedLabel} · ${selectedTrace.file}` : 'Select a trace to search for crossings.');
  return (
    <AnalysisFeatureCard title={lineMode && line ? `${lineName} crossings` : "Threshold crossings"} testId="analysis-card-threshold-crossings" source={source} onClose={() => dispatch({ type: 'TOGGLE_PANEL', payload: { id: 'threshold-crossings', forceValue: false } })}>
      <CrossingsView sourceLine={sourceLine} count={lineMode ? lineCrossings.length : crossings.length}
        rows={lineMode ? lineCrossingRows(lineCrossings, units, paneTitles, traceLabels) : manualCrossingRows(crossings, selectedLabel, selectedTrace?.units.x)}
        emptyText={lineMode && !line ? 'Line no longer exists.' : 'No crossings'}
        {...(lineMode ? { onManual: () => setLineId(null) } : { threshold: { text: thresholdText, onChange: setThresholdText, invalid: !parsed.ok } })} />
    </AnalysisFeatureCard>
  );
}
