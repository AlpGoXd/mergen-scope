export interface ReadOnlyMetricRowProps {
	label: string;
	value: string;
}

export function ReadOnlyMetricRow({ label, value }: ReadOnlyMetricRowProps) {
	return (
		<div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
			<span style={{ color: 'var(--muted)' }}>{label}</span>
			<span style={{ color: 'var(--text)', fontWeight: 600 }}>{value}</span>
		</div>
	);
}
