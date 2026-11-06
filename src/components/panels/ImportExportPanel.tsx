import { useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Btn } from '../shared/Btn';
import { AnalysisFeatureCard } from '../analysis/AnalysisFeatureCard';
import { useFileState } from '../../stores/file-store';
import { useTraceState } from '../../stores/trace-store';
import { useUiDispatch } from '../../stores/ui-store';
import { useWorkspace } from '../../hooks/use-workspace';
import { DATA_FILE_ACCEPT, useFileImport } from '../../hooks/use-file-import';
import { tracesToCSV } from '../../domain/export';

function downloadTextFile(fileName: string, text: string, mimeType: string) {
	const blob = new Blob([text], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Import/export operations for files, traces, and workspace snapshots.
 */
export function ImportExportPanel() {
	const { files } = useFileState();
	const { allTraces, vis } = useTraceState();
	const importFiles = useFileImport();
	const uiDispatch = useUiDispatch();
	const { downloadWorkspace, loadFromFile } = useWorkspace();

	const importRef = useRef<HTMLInputElement>(null);
	const workspaceRef = useRef<HTMLInputElement>(null);

	const visibleTraces = useMemo(
		() => allTraces.filter((trace) => vis[trace.name] !== false),
		[allTraces, vis]
	);

	const importCountLabel = `${files.length} file${files.length === 1 ? '' : 's'} loaded`;

	const onImportFiles = (evt: ChangeEvent<HTMLInputElement>) => {
		const selected = Array.from(evt.target.files ?? []);
		evt.target.value = ''; // reset first so picking the same file again still fires onChange
		void importFiles(selected);
	};

	const onLoadWorkspace = (evt: ChangeEvent<HTMLInputElement>) => {
		const file = evt.target.files?.[0];
		if (file) {
			loadFromFile(file);
		}
		evt.target.value = '';
	};

	const onExportVisibleCsv = () => {
		if (visibleTraces.length === 0) return;
		downloadTextFile('visible-traces.csv', tracesToCSV(visibleTraces, 'Frequency'), 'text/csv;charset=utf-8');
	};

	return (
		<AnalysisFeatureCard
			title="Import / Export"
			description={importCountLabel}
			onClose={() => uiDispatch({ type: 'SET', payload: { key: 'showImportExportPanel', value: false } })}
		>
			<input
				data-testid="import-export-data-input"
				ref={importRef}
				type="file"
				multiple
				accept={DATA_FILE_ACCEPT}
				style={{ display: 'none' }}
				onChange={onImportFiles}
			/>
			<input
				data-testid="import-export-workspace-input"
				ref={workspaceRef}
				type="file"
				accept=".json"
				style={{ display: 'none' }}
				onChange={onLoadWorkspace}
			/>

			<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
				<Btn soft color="var(--accent)" onClick={() => importRef.current?.click()}>
					Import Data Files
				</Btn>
				<Btn soft color="var(--accent)" onClick={() => workspaceRef.current?.click()}>
					Load Workspace
				</Btn>
				<Btn soft color="var(--accent)" disabled={files.length === 0} onClick={() => downloadWorkspace()}>
					Save Workspace
				</Btn>
				<Btn soft color="var(--accent)" disabled={visibleTraces.length === 0} onClick={onExportVisibleCsv}>
					Export Visible CSV
				</Btn>
			</div>
		</AnalysisFeatureCard>
	);
}
