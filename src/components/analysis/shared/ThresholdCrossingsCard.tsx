import { useMemo, useState } from 'react';
import { findThresholdCrossings } from '../../../domain/analysis/threshold';
import { useUiState } from '../../../stores/ui-store';
import { useTraceState } from '../../../stores/trace-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';

export function ThresholdCrossingsCard() {
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
