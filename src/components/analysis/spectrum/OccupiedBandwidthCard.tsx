import { useMemo, useState } from 'react';
import { computeOccupiedBandwidth } from '../../../domain/analysis/channel-power';
import { useUiState } from '../../../stores/ui-store';
import { useTraceState } from '../../../stores/trace-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';

export function OccupiedBandwidthCard() {
	const { allTraces } = useTraceState();
	const { selectedTraceName } = useUiState();
	const [percentText, setPercentText] = useState<string>('99');

	const trace = useMemo(
		() => allTraces.find((item) => item.name === selectedTraceName) ?? null,
		[allTraces, selectedTraceName],
	);

	const percent = Number(percentText);
	const result = useMemo(() => {
		if (!trace || !Number.isFinite(percent) || percent <= 0 || percent >= 100) {
			return null;
		}
		const yUnit = typeof trace.units.y === 'string' ? trace.units.y : '';
		return computeOccupiedBandwidth(trace.data, percent, yUnit);
	}, [trace, percent]);

	return (
		<AnalysisFeatureCard title="Occupied Bandwidth" description="Find bandwidth that contains a percentage of total power.">
			<div style={{ display: 'grid', gap: '8px' }}>
				<label style={{ display: 'grid', gap: '4px', fontSize: 'var(--font-label)' }}>
					Occupied power (%)
					<input value={percentText} onChange={(event) => setPercentText(event.target.value)} />
				</label>
				<div style={{ fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)' }}>
					{result?.supported && typeof result.bandwidth === 'number'
						? `${result.bandwidth.toExponential(4)} Hz`
						: 'Select a trace with power units (dBm or dBW).'}
				</div>
			</div>
		</AnalysisFeatureCard>
	);
}
