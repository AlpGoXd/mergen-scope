import type { Trace } from '../../types/trace';

export interface TraceRowProps {
	trace: Trace;
	color?: string;
	visible: boolean;
	selected: boolean;
	paneLabel?: string;
	onSelect: () => void;
	onToggleVisible: () => void;
	onRemove?: () => void;
	onReimport?: () => void;
}

export function TraceRow(props: TraceRowProps) {
	const {
		trace,
		color = 'var(--accent)',
		visible,
		selected,
		paneLabel,
		onSelect,
		onToggleVisible,
		onRemove,
		onReimport,
	} = props;

	return (
		<div
			onClick={onSelect}
			style={{
				border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
				borderRadius: '8px',
				padding: '6px',
				display: 'grid',
				gridTemplateColumns: 'auto 1fr auto auto',
				gap: '6px',
				alignItems: 'center',
				cursor: 'pointer',
			}}
		>
			<input
				type="checkbox"
				checked={visible}
				onClick={(event) => event.stopPropagation()}
				onChange={() => onToggleVisible()}
			/>
			<span style={{ color, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
				{trace.dn || trace.name}
			</span>
			{paneLabel && <span style={{ fontSize: '10px', color: 'var(--dim)' }}>{paneLabel}</span>}
			<div style={{ display: 'flex', gap: '4px' }}>
				{onReimport && (
					<button type="button" onClick={(event) => { event.stopPropagation(); onReimport(); }}>
						Re-import
					</button>
				)}
				{onRemove && (
					<button type="button" onClick={(event) => { event.stopPropagation(); onRemove(); }}>
						×
					</button>
				)}
			</div>
		</div>
	);
}
