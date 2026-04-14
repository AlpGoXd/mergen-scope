export interface WizardColumnConfigProps {
	headers: readonly string[];
	xCol: number;
	yCols: readonly number[];
	onChangeXCol: (xCol: number) => void;
	onChangeYCols: (yCols: number[]) => void;
}

export function WizardColumnConfig(props: WizardColumnConfigProps) {
	const { headers, xCol, yCols, onChangeXCol, onChangeYCols } = props;

	const toggleYCol = (idx: number) => {
		if (yCols.includes(idx)) {
			onChangeYCols(yCols.filter((item) => item !== idx));
			return;
		}
		onChangeYCols([...yCols, idx].sort((a, b) => a - b));
	};

	return (
		<div style={{ display: 'grid', gap: '8px' }}>
			<label style={{ display: 'grid', gap: '4px', fontSize: 'var(--font-label)' }}>
				X column
				<select value={xCol} onChange={(event) => onChangeXCol(Number(event.target.value))}>
					{headers.map((header, idx) => (
						<option key={idx} value={idx}>
							{idx + 1}: {header || `(column ${idx + 1})`}
						</option>
					))}
				</select>
			</label>

			<div style={{ display: 'grid', gap: '4px' }}>
				<span style={{ fontSize: 'var(--font-label)' }}>Y columns</span>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
					{headers.map((header, idx) => (
						<label key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: 'var(--font-label)' }}>
							<input
								type="checkbox"
								checked={yCols.includes(idx)}
								disabled={idx === xCol}
								onChange={() => toggleYCol(idx)}
							/>
							{idx + 1}: {header || `(column ${idx + 1})`}
						</label>
					))}
				</div>
			</div>
		</div>
	);
}
