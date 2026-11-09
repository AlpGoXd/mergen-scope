import { useMemo, useState } from 'react';
import { computeChannelPower } from '../../../domain/analysis/channel-power';
import { useUiState } from '../../../stores/ui-store';
import { useTraceState } from '../../../stores/trace-store';
import { AnalysisFeatureCard } from '../AnalysisFeatureCard';

export function ChannelPowerCard() {
	const { allTraces } = useTraceState();
	const { selectedTraceName } = useUiState();
	const [bandwidthHzText, setBandwidthHzText] = useState<string>('1000000');

	const trace = useMemo(
		() => allTraces.find((item) => item.name === selectedTraceName) ?? null,
		[allTraces, selectedTraceName],
	);

	const bandwidthHz = Number(bandwidthHzText);
	const result = useMemo(() => {
		if (!trace || !Number.isFinite(bandwidthHz) || bandwidthHz <= 0) {
			return null;
		}
		const yUnit = typeof trace.units.y === 'string' ? trace.units.y : '';
		return computeChannelPower(trace.data, yUnit);
	}, [trace, bandwidthHz]);

	return (
		<AnalysisFeatureCard title="Channel Power" description="Integrate selected trace power over channel bandwidth.">
			<div className="ac-kvs">
				<label className="ac-field">
					Bandwidth (Hz)
					<input value={bandwidthHzText} onChange={(event) => setBandwidthHzText(event.target.value)} />
				</label>
				{result?.supported && typeof result.powerDbm === 'number'
					? <div className="ac-result">{result.powerDbm.toFixed(4)}<small>dBm</small></div>
					: <div className="ac-note">Select a trace with spectral density units (dBm/Hz or dBW/Hz).</div>}
			</div>
		</AnalysisFeatureCard>
	);
}
