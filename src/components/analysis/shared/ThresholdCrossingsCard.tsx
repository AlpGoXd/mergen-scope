import { createContext, useContext, useMemo, useState } from 'react';
import { computeLineIntersections } from '../../../domain/ref-lines';
import { useRefLineState } from '../../../stores/ref-line-store';
import { usePaneState } from '../../../stores/pane-store';
import { findThresholdCrossings } from '../../../domain/analysis/threshold';
import { useUiState } from '../../../stores/ui-store';
import { useTraceState } from '../../../stores/trace-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';

export const LineCrossingsContext = createContext<{ lineId: number | null; setLineId: (id: number | null) => void }>({ lineId: null, setLineId: () => {} });

export function ThresholdCrossingsCard() {
  const { lineId, setLineId } = useContext(LineCrossingsContext);
  const { refLines } = useRefLineState();
  const { panes, tracePaneMap } = usePaneState();
  const { vis } = useTraceState();
  const line = refLines.find(item => item.id === lineId);
	const { allTraces } = useTraceState();
	const { selectedTraceName } = useUiState();
	const [thresholdText, setThresholdText] = useState<string>('0');

	const selectedTrace = useMemo(
		() => allTraces.find((trace) => trace.name === selectedTraceName) ?? null,
		[allTraces, selectedTraceName],
	);

	const threshold = Number(thresholdText);
	const crossings = useMemo(() => {
		if (!selectedTrace || !Number.isFinite(threshold)) {
			return [];
		}
		return findThresholdCrossings(selectedTrace.data, threshold);
	}, [selectedTrace, threshold]);

  const lineCrossings = useMemo(() => line ? computeLineIntersections(line, refLines, allTraces, tracePaneMap, vis) : [], [line, refLines, allTraces, tracePaneMap, vis]);
  if (lineId !== null) return (
    <AnalysisFeatureCard title="Threshold Crossings" description="Reference line intersections with visible traces.">
      <button onClick={() => setLineId(null)}>Manual threshold</button>
      {line ? <>
        <div>{line.type === 'v' ? 'Vertical' : 'Horizontal'} line {line.label || line.id}: {line.value}</div>
        <div>Found {lineCrossings.length} crossing{lineCrossings.length === 1 ? '' : 's'}</div>
        <div style={{ maxHeight: '160px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
          {lineCrossings.map((point, idx) => <div key={idx} style={{ padding: '6px', fontSize: 'var(--font-label)', borderTop: idx ? '1px solid var(--border)' : 'none' }}>
            {point.traceName} ? {panes.find(pane => pane.id === point.paneId)?.title || point.paneId} ? x={point.freq.toExponential(5)} ? y={point.amp.toExponential(5)}
          </div>)}
          {!lineCrossings.length && <div style={{ padding: '6px' }}>No crossings</div>}
        </div>
      </> : <div>Line no longer exists.</div>}
    </AnalysisFeatureCard>
  );

	return (
		<AnalysisFeatureCard title="Threshold Crossings" description="Locate where the active trace crosses a threshold.">
			<div style={{ display: 'grid', gap: '8px' }}>
				<label style={{ display: 'grid', gap: '4px', fontSize: 'var(--font-label)' }}>
					Threshold
					<input value={thresholdText} onChange={(event) => setThresholdText(event.target.value)} />
				</label>
				<div style={{ fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)' }}>
					Found {crossings.length} crossing{crossings.length === 1 ? '' : 's'}
				</div>
				<div style={{ maxHeight: '160px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
					{crossings.slice(0, 20).map((point, idx) => (
						<div key={idx} style={{ padding: '6px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}>
							f={point.freq.toExponential(5)} ({point.mode})
						</div>
					))}
					{crossings.length === 0 && <div style={{ padding: '6px', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', color: 'var(--dim)' }}>No crossings</div>}
				</div>
			</div>
		</AnalysisFeatureCard>
	);
}
