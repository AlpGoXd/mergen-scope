import { useEffect, useMemo, useState } from 'react';
import { useFileDispatch, useFileState } from '../../stores/file-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import type { OpenChoice } from '../../types/open-files-plan';
import type { WizardConfig } from '../../types/file';
import { summarizeTabularPreview } from '../../domain/parsers/tabular';
import { WizardPreviewTable } from './WizardPreviewTable';
import { WizardColumnConfig } from './WizardColumnConfig';
import { WizardDomainPicker } from './WizardDomainPicker';

/** Header names come from the row just above the data; with no such row, columns are numbered. */
function buildHeaders(lines: readonly string[], delimiter: string, skipRows: number): string[] {
	const headerLine = skipRows > 0 ? lines[skipRows - 1] : undefined;
	if (headerLine !== undefined) {
		return headerLine.split(delimiter).map((part) => part.trim());
	}
	const columnCount = lines[0]?.split(delimiter).length ?? 0;
	return Array.from({ length: columnCount }, (_, idx) => `Column ${idx + 1}`);
}

function createFallbackConfig(lines: readonly string[]): WizardConfig {
	const delimiter = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(';') ? ';' : ',';
	const headers = buildHeaders(lines, delimiter, 1);
	const firstY = headers.length > 1 ? 1 : 0;
	return {
		delimiter,
		skipRows: 1,
		xCol: 0,
		yCols: headers.length > 1 ? [firstY] : [0],
		xMult: 1,
		yMult: 1,
		domain: 'frequency',
		confidence: 0,
		headers,
	};
}

function formatRangeValue(value: number): string {
	return Math.abs(value) >= 1e4 || (value !== 0 && Math.abs(value) < 1e-3) ? value.toExponential(3) : String(Number(value.toPrecision(6)));
}

export function ImportWizardModal() {
	const { wizardQueue } = useFileState();
	const fileDispatch = useFileDispatch();
	const aggregate = useOptionalAggregateWorkspace();
	const active = wizardQueue[0];

	const initialConfig = useMemo<WizardConfig>(() => {
		if (!active) {
			return createFallbackConfig([]);
		}
		const suggested = active.suggestedConfig;
		if (suggested) {
			return { ...suggested, headers: buildHeaders(active.previewLines, suggested.delimiter, suggested.skipRows) };
		}
		return createFallbackConfig(active.previewLines);
	}, [active]);

	const [config, setConfig] = useState<WizardConfig>(initialConfig);

	useEffect(() => {
		setConfig(initialConfig);
	}, [initialConfig]);

	const confirm = () => {
		if (!active) return;
		const batch=active.pendingBatch;
		const decisions: Record<string,{choice:OpenChoice;expectedFileId?:string}> = {};
		let workspaceChoice: 'replace' | undefined;
		if (batch && aggregate && wizardQueue.filter(entry=>entry.pendingBatch?.id===batch.id).length === 1) {
			const current=aggregate.state;
			if (batch.workspace) {
				const work=current.files.files.length>0 || current.traces.derivedTraces.length>0 || current.markers.markers.length>0 || current.lines.refLines.length>0 || current.panes.panes.length>1;
				if (work) { if (!window.confirm('Replace the current workspace with the opened workspace?')) return; workspaceChoice='replace'; }
			}
			const files=batch.workspace?.snapshot.files ?? current.files.files;
			for (const input of batch.inputs) {
				const existing=files.find(file=>file.fileName===input.name);
				if (!existing || input.choice==='copy' || (input.choice==='replace' && input.expectedFileId===String(existing.id))) continue;
				const answer=window.prompt(`${input.name} is already open. Type replace or copy, or cancel opening.`, 'copy');
				const choice=answer?.trim().toLowerCase();
				if (choice!=='replace' && choice!=='copy') return;
				decisions[input.id]={choice,expectedFileId:choice==='replace' ? String(existing.id) : undefined};
			}
		}
		fileDispatch({type:'RESOLVE_WIZARD',payload:{id:active.id,config,decisions,workspaceChoice}});
	};

	const skip = () => {
		if (active) fileDispatch({ type: 'SKIP_WIZARD', payload: { id: active.id } });
	};

	useEffect(() => {
		if (!active) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') fileDispatch({ type: 'SKIP_WIZARD', payload: { id: active.id } });
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [active, fileDispatch]);

	const summary = useMemo(
		() => (active ? summarizeTabularPreview(active.previewLines, config) : null),
		[active, config],
	);

	if (!active) {
		return null;
	}

	const headers = config.headers;
	const updateLayout = (delimiter: string, skipRows: number) => {
		setConfig((prev) => ({ ...prev, delimiter, skipRows, headers: buildHeaders(active.previewLines, delimiter, skipRows) }));
	};
	const previewIsPartial = active.previewLines.length >= 100;
	const headerSource = config.skipRows > 0 ? `row ${config.skipRows}` : 'none (columns are numbered)';

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(0,0,0,0.45)',
				display: 'grid',
				placeItems: 'center',
				zIndex: 60,
				padding: '16px',
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="import-wizard-title"
				data-testid="import-wizard"
				style={{
					width: 'min(980px, 95vw)',
					maxHeight: '90vh',
					overflow: 'auto',
					borderRadius: '12px',
					border: '1px solid var(--border)',
					background: 'var(--card)',
					color: 'var(--text)',
					padding: '14px',
					display: 'grid',
					gap: '10px',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
					<div style={{ flex: 1, minWidth: 0 }}>
						<h2 id="import-wizard-title" style={{ margin: 0, fontSize: 'var(--font-title)', lineHeight: 'var(--lh-title)' }}>Import table</h2>
						<div style={{ fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', color: 'var(--dim)' }}>
							{active.fileName}: choose which rows and columns hold the data. The preview below updates as you change settings.
						</div>
					</div>
					{wizardQueue.length > 1 && (
						<span data-testid="import-wizard-queue" style={{ fontSize: 'var(--font-label)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
							File 1 of {wizardQueue.length}
						</span>
					)}
				</div>

				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
					<label style={{ display: 'grid', gap: '4px', fontSize: 'var(--font-label)' }}>
						Delimiter
						<select value={config.delimiter} onChange={(event) => updateLayout(event.target.value, config.skipRows)}>
							<option value=",">Comma</option>
							<option value=";">Semicolon</option>
							<option value={'\t'}>Tab</option>
						</select>
					</label>
					<label style={{ display: 'grid', gap: '4px', fontSize: 'var(--font-label)' }}>
						Data starts at row
						<input
							type="number"
							min={1}
							step={1}
							value={config.skipRows + 1}
							onChange={(event) => {
								const row = Math.floor(Number(event.target.value));
								updateLayout(config.delimiter, Number.isFinite(row) ? Math.max(0, row - 1) : 0);
							}}
						/>
						<span style={{ color: 'var(--dim)' }}>Column names from: {headerSource}</span>
					</label>
				</div>

				<WizardDomainPicker
					domain={config.domain}
					onChangeDomain={(domain) => setConfig((prev) => ({ ...prev, domain }))}
				/>

				<WizardColumnConfig
					headers={headers}
					xCol={config.xCol}
					yCols={config.yCols}
					onChangeXCol={(xCol) => setConfig((prev) => ({ ...prev, xCol, yCols: prev.yCols.filter((col) => col !== xCol) }))}
					onChangeYCols={(yCols) => setConfig((prev) => ({ ...prev, yCols }))}
				/>

				<WizardPreviewTable
					lines={active.previewLines}
					delimiter={config.delimiter}
					skipRows={config.skipRows}
					headers={headers}
					xCol={config.xCol}
					yCols={config.yCols}
				/>

				<div data-testid="import-wizard-summary" style={{ fontSize: 'var(--font-label)', color: summary && summary.dataRows > 1 && config.yCols.length > 0 ? 'var(--text)' : 'var(--dim)' }}>
					{summary && summary.dataRows > 1 && config.yCols.length > 0
						? `Will import ${config.yCols.length} trace${config.yCols.length === 1 ? '' : 's'} · ${summary.dataRows}${previewIsPartial ? '+' : ''} rows · X ${formatRangeValue(summary.xMin ?? 0)} to ${formatRangeValue(summary.xMax ?? 0)}`
						: config.yCols.length === 0
							? 'Pick at least one Y column.'
							: 'No numeric data rows with these settings. Check the delimiter and start row.'}
				</div>

				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
					{wizardQueue.length > 1 && (
						<button type="button" onClick={() => fileDispatch({ type: 'SKIP_ALL_WIZARD' })}>
							Skip all
						</button>
					)}
					<button type="button" onClick={skip} title="Skip this file (Esc)">
						Skip
					</button>
					<button
						type="button"
						onClick={confirm}
						disabled={config.yCols.length === 0}
					>
						Confirm
					</button>
				</div>
			</div>
		</div>
	);
}
