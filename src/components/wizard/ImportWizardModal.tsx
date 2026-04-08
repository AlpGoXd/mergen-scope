import { useEffect, useMemo, useState } from 'react';
import { useFileDispatch, useFileState } from '../../stores/file-store';
import type { WizardConfig } from '../../types/file';
import { WizardPreviewTable } from './WizardPreviewTable';
import { WizardColumnConfig } from './WizardColumnConfig';
import { WizardDomainPicker } from './WizardDomainPicker';

function buildHeaders(lines: readonly string[], delimiter: string, skipRows: number): string[] {
	const headerLine = skipRows > 0 ? lines[skipRows - 1] : lines[0];
	if (!headerLine) {
		return [];
	}
	return headerLine.split(delimiter).map((part) => part.trim());
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

export function ImportWizardModal() {
	const { wizardQueue } = useFileState();
	const fileDispatch = useFileDispatch();
	const active = wizardQueue[0];
	const [showFullWizard, setShowFullWizard] = useState(false);

	const initialConfig = useMemo<WizardConfig>(() => {
		if (!active) {
			return createFallbackConfig([]);
		}
		const suggested = active.suggestedConfig;
		if (suggested) {
			return {
				...suggested,
				headers: suggested.headers?.length
					? [...suggested.headers]
					: buildHeaders(active.previewLines, suggested.delimiter, suggested.skipRows),
			};
		}
		return createFallbackConfig(active.previewLines);
	}, [active]);

	const [config, setConfig] = useState<WizardConfig>(initialConfig);

	useEffect(() => {
		setConfig(initialConfig);
		setShowFullWizard(false);
	}, [initialConfig]);

	useEffect(() => {
		if (!active) {
			return;
		}
		if (showFullWizard || config.confidence < 0.9) {
			return;
		}

		const timer = window.setTimeout(() => {
			fileDispatch({ type: 'RESOLVE_WIZARD', payload: { id: active.id, config } });
		}, 1500);

		return () => window.clearTimeout(timer);
	}, [active, config, fileDispatch, showFullWizard]);

	if (!active) {
		return null;
	}

	const headers = config.headers?.length
		? [...config.headers]
		: buildHeaders(active.previewLines, config.delimiter, config.skipRows);

	const compactHighConfidence = config.confidence >= 0.9 && !showFullWizard;

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
				style={{
					width: compactHighConfidence ? '420px' : 'min(980px, 95vw)',
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
				<div>
					<h2 style={{ margin: 0, fontSize: '15px' }}>Import Wizard</h2>
					<div style={{ fontSize: '12px', color: 'var(--dim)' }}>{active.fileName}</div>
				</div>

				{compactHighConfidence && (
					<div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', fontSize: '12px' }}>
						High confidence parse detected ({Math.round(config.confidence * 100)}%).
						Auto-advance is running.
					</div>
				)}

				{!compactHighConfidence && (
					<>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
							<label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}>
								Delimiter
								<select
									value={config.delimiter}
									onChange={(event) => {
										const delimiter = event.target.value;
										const nextHeaders = buildHeaders(active.previewLines, delimiter, config.skipRows);
										setConfig((prev) => ({ ...prev, delimiter, headers: nextHeaders }));
									}}
								>
									<option value=",">Comma</option>
									<option value=";">Semicolon</option>
									<option value={'\t'}>Tab</option>
								</select>
							</label>
							<label style={{ display: 'grid', gap: '4px', fontSize: '11px' }}>
								Skip rows
								<input
									type="number"
									min={0}
									value={config.skipRows}
									onChange={(event) => {
										const skipRows = Number(event.target.value);
										const nextHeaders = buildHeaders(active.previewLines, config.delimiter, skipRows);
										setConfig((prev) => ({ ...prev, skipRows, headers: nextHeaders }));
									}}
								/>
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
							onChangeXCol={(xCol) => setConfig((prev) => ({ ...prev, xCol }))}
							onChangeYCols={(yCols) => setConfig((prev) => ({ ...prev, yCols }))}
						/>

						<WizardPreviewTable lines={active.previewLines} delimiter={config.delimiter} />
					</>
				)}

				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
					{compactHighConfidence && (
						<button type="button" onClick={() => setShowFullWizard(true)}>
							Edit
						</button>
					)}
					<button type="button" onClick={() => fileDispatch({ type: 'SKIP_WIZARD', payload: { id: active.id } })}>
						Skip
					</button>
					{!compactHighConfidence && (
						<button
							type="button"
							onClick={() => fileDispatch({ type: 'RESOLVE_WIZARD', payload: { id: active.id, config } })}
							disabled={config.yCols.length === 0}
						>
							Confirm
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
