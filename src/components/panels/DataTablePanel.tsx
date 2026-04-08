import { useMemo } from 'react';
import { useTraceState } from '../../stores/trace-store';
import { useUiState } from '../../stores/ui-store';

export function DataTablePanel() {
	const { allTraces } = useTraceState();
	const { selectedTraceName } = useUiState();

	const trace = useMemo(
		() => allTraces.find((item) => item.name === selectedTraceName) ?? null,
		[allTraces, selectedTraceName],
	);

	const rows = trace?.data.slice(0, 300) ?? [];

	return (
		<div style={{ padding: '10px' }}>
			<h3 style={{ margin: '0 0 8px 0', fontSize: '13px' }}>Data Table</h3>
			{!trace && (
				<div style={{ fontSize: '12px', color: 'var(--dim)' }}>
					Select a trace to inspect its source points.
				</div>
			)}
			{trace && (
				<div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '56vh' }}>
					<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
						<thead>
							<tr style={{ background: 'var(--bg)' }}>
								<th style={{ textAlign: 'left', padding: '6px' }}>#</th>
								<th style={{ textAlign: 'left', padding: '6px' }}>Freq</th>
								<th style={{ textAlign: 'right', padding: '6px' }}>Amp</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((point, index) => (
								<tr key={index} style={{ borderTop: '1px solid var(--border)' }}>
									<td style={{ padding: '4px 6px', color: 'var(--dim)' }}>{index}</td>
									<td style={{ padding: '4px 6px' }}>{point.freq.toExponential(6)}</td>
									<td style={{ padding: '4px 6px', textAlign: 'right' }}>{point.amp.toFixed(5)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
