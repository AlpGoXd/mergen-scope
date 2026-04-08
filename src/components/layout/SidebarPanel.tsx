import { useState } from 'react';

export interface SidebarPanelProps {
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}

export function SidebarPanel({ title, defaultOpen = true, children }: SidebarPanelProps) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<section style={{ marginBottom: '10px' }}>
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				style={{
					width: '100%',
					textAlign: 'left',
					border: '1px solid var(--border)',
					borderRadius: '6px',
					background: 'var(--bg)',
					color: 'var(--text)',
					padding: '6px 8px',
					cursor: 'pointer',
					fontSize: '11px',
					fontWeight: 700,
				}}
			>
				{open ? '▾' : '▸'} {title}
			</button>
			{open && <div style={{ marginTop: '6px' }}>{children}</div>}
		</section>
	);
}
