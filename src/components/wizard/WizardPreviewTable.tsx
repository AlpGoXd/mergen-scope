export interface WizardPreviewTableProps {
	lines: readonly string[];
	delimiter: string;
	/** Rows before the data; the last of them provides the column names. */
	skipRows?: number;
	headers?: readonly string[];
	xCol?: number;
	yCols?: readonly number[];
}

const tagStyle = {
	display: 'inline-block',
	marginLeft: '6px',
	padding: '0 5px',
	borderRadius: '4px',
	fontSize: 'var(--font-caption)',
	fontWeight: 600,
	color: 'var(--card)',
} as const;

export function WizardPreviewTable({ lines, delimiter, skipRows = 0, headers = [], xCol, yCols = [] }: WizardPreviewTableProps) {
	const previewRows = lines.slice(0, 20).map((line) => line.split(delimiter));
	const maxCols = previewRows.reduce((max, row) => Math.max(max, row.length), 0);
	const headerRowIdx = skipRows - 1;

	return (
		<div style={{ border: '1px solid var(--border)', borderRadius: '6px', maxHeight: '240px', overflow: 'auto' }}>
			<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)' }}>
				<thead>
					<tr style={{ background: 'var(--bg)' }}>
						<th style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--dim)', textAlign: 'right' }}>Row</th>
						{Array.from({ length: maxCols }, (_, idx) => {
							const role = idx === xCol ? 'X' : yCols.includes(idx) ? 'Y' : null;
							return (
								<th key={idx} data-testid={`wizard-col-${idx}`} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', opacity: role ? 1 : 0.6 }}>
									{headers[idx] || `Column ${idx + 1}`}
									{role && <span style={{ ...tagStyle, background: role === 'X' ? 'var(--accent)' : 'var(--muted)' }}>{role}</span>}
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{previewRows.map((row, rowIdx) => {
						const isHeader = rowIdx === headerRowIdx;
						const isSkipped = rowIdx < skipRows && !isHeader;
						return (
							<tr key={rowIdx} style={{ color: isSkipped ? 'var(--dim)' : undefined, fontWeight: isHeader ? 600 : undefined, fontStyle: isSkipped ? 'italic' : undefined }}>
								<td style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
									{isHeader ? `${rowIdx + 1} · names` : isSkipped ? `${rowIdx + 1} · skipped` : rowIdx + 1}
								</td>
								{Array.from({ length: maxCols }, (_, colIdx) => (
									<td key={colIdx} style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>
										{row[colIdx] ?? ''}
									</td>
								))}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
