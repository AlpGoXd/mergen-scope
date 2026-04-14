export interface WizardPreviewTableProps {
	lines: readonly string[];
	delimiter: string;
}

export function WizardPreviewTable({ lines, delimiter }: WizardPreviewTableProps) {
	const previewRows = lines.slice(0, 20).map((line) => line.split(delimiter));
	const maxCols = previewRows.reduce((max, row) => Math.max(max, row.length), 0);

	return (
		<div style={{ border: '1px solid var(--border)', borderRadius: '6px', maxHeight: '240px', overflow: 'auto' }}>
			<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)' }}>
				<thead>
					<tr style={{ background: 'var(--bg)' }}>
						{Array.from({ length: maxCols }, (_, idx) => (
							<th key={idx} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>
								Col {idx + 1}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{previewRows.map((row, rowIdx) => (
						<tr key={rowIdx}>
							{Array.from({ length: maxCols }, (_, colIdx) => (
								<td key={colIdx} style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>
									{row[colIdx] ?? ''}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
