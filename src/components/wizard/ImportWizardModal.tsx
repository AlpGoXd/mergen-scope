import { useEffect, useMemo, useRef, useState } from 'react';
import { useFileDispatch, useFileState } from '../../stores/file-store';
import type { WizardEntry } from '../../stores/file-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { useAsk } from '../../stores/dialog-store';
import { replaceWorkspaceText, sameNameText } from '../../domain/confirm-text';
import { copyName } from '../../domain/open-files-plan';
import { workspaceCounts } from '../../hooks/use-file-import';
import { useTraceState } from '../../stores/trace-store';
import { useMarkerState } from '../../stores/marker-store';
import type { OpenChoice } from '../../types/open-files-plan';
import type { WizardConfig } from '../../types/file';
import { breaksFrequencyGaps } from '../../domain/sweep-bands';
import { detectTabular } from '../../domain/parsers/tabular-detect';
import {
  columnDisplayName, columnRole, hasColumnNames, importableYCols, listNames, matchPriorColumns, previewCaption,
  overviewPlot, plotCaption, previewRangeSummary, readNumericTable, setColumnRole, wizardBlocker, wizardLayout,
} from '../../domain/import-wizard';
import { useWizardTraceColors } from '../../hooks/use-wizard-trace-colors';
import { Btn } from '../shared/Btn';
import { Icon, MessageBar, Segmented } from '../shared/Controls';
import { WizardPreviewTable, PREVIEW_ROWS } from './WizardPreviewTable';
import { WizardSettings } from './WizardSettings';
import { WizardPreviewPlot } from './WizardPreviewPlot';
import { BinaryWizardDialog } from './BinaryWizardDialog';
import './import-wizard.css';

function configFor(entry: WizardEntry): WizardConfig {
  const detected = detectTabular(entry.rawText).config;
  const base = entry.suggestedConfig ?? detected;
  return { ...base, headers: wizardLayout(entry.rawText, base).headers };
}

/** Is focus somewhere Enter already means something else (a button, a menu, a list)? */
function enterIsTaken(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('.ui-popover')) return true;
  return target instanceof HTMLButtonElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

export function ImportWizardModal() {
  const { wizardQueue, files } = useFileState();
  const active = wizardQueue[0];
  // "File i of n" counts every file queued since the wizard last closed.
  const seen = useRef(new Set<string>());
  if (!active) seen.current.clear();
  for (const entry of wizardQueue) if (entry.mode !== 'edit') seen.current.add(entry.id);
  if (!active) return null;
  const total = Math.max(1, seen.current.size);
  const queued = wizardQueue.filter(entry => entry.mode !== 'edit').length;
  const position = active.mode === 'edit' ? 1 : total - queued + 1;
  const displayTotal = active.mode === 'edit' ? 1 : total;
  const priorFile = active.mode === 'edit' ? files.find(file => String(file.id) === active.id) : undefined;
  const isBinaryView = (active.wizardView ?? (active.rawBinary ? 'binary' : 'text')) === 'binary';
  if (isBinaryView && active.rawBinary) {
    const others = wizardQueue.slice(1).filter(entry => entry.mode !== 'edit' && (entry.wizardView ?? (entry.rawBinary ? 'binary' : 'text')) === 'binary' && Boolean(entry.rawBinary));
    return <BinaryWizardDialog key={active.id} entry={active} buffer={active.rawBinary} position={position} total={displayTotal} others={others} queue={wizardQueue} priorFile={priorFile} />;
  }
  return <WizardDialog key={active.id} entry={active} position={position} total={displayTotal} others={wizardQueue.slice(1).filter(entry => entry.mode !== 'edit' && (entry.wizardView ?? (entry.rawBinary ? 'binary' : 'text')) === 'text')} queue={wizardQueue} priorFile={priorFile} />;
}

interface WizardDialogProps {
  entry: WizardEntry;
  position: number;
  total: number;
  others: readonly WizardEntry[];
  queue: readonly WizardEntry[];
  priorFile: ReturnType<typeof useFileState>['files'][number] | undefined;
}

function WizardDialog({ entry, position, total, others, queue, priorFile }: WizardDialogProps) {
  const fileDispatch = useFileDispatch();
  const aggregate = useOptionalAggregateWorkspace();
  const ask = useAsk();
  // True while an app dialog asks about this batch: the wizard's own Enter / Esc wait.
  const asking = useRef(false);
  const { allKnownTraces } = useTraceState();
  const { markers } = useMarkerState();
  const [config, setConfig] = useState<WizardConfig>(() => configFor(entry));
  const [rowLimit, setRowLimit] = useState(PREVIEW_ROWS);
  const [applyToOthers, setApplyToOthers] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const editing = entry.mode === 'edit';

  const detection = useMemo(() => detectTabular(entry.rawText), [entry.rawText]);
  const layout = useMemo(() => wizardLayout(entry.rawText, config), [entry.rawText, config.delimiter, config.valueDelimiter, config.skipRows]);
  const headers = layout.headers;
  const named = hasColumnNames(config, headers);
  const blocker = wizardBlocker(config, layout);
  const yCols = importableYCols(config, layout);
  // Whole-file plot: numbers are read when the layout changes; roles only pick and re-reduce columns.
  const numericTable = useMemo(() => readNumericTable(layout.lines, config, config.skipRows, layout.headers.length), [layout, config.delimiter, config.valueDelimiter, config.skipRows]);
  // yCols is a fresh array each render; compare it by content.
  const yColsKey = yCols.join(',');
  const splitBands = breaksFrequencyGaps(config);
  const plot = useMemo(() => overviewPlot(numericTable, config.xCol, yCols, PREVIEW_ROWS, undefined, splitBands), [numericTable, config.xCol, yColsKey, splitBands]);
  const rangeText = useMemo(() => previewRangeSummary(plot, config), [plot, config.domain, config.xUnit, config.yUnit, config.xMult, config.yMult]);

  // Import settings on an open file: which existing trace each Y column continues, and which traces go away.
  const prior = useMemo(() => {
    if (!priorFile) return [];
    const identities = priorFile.columnIdentities ?? [];
    const displays = priorFile.displayTraces ?? [];
    return identities.map((identity, index) => {
      const display = displays[index];
      const trace = display ? allKnownTraces.find(item => item.id === display.id || item.parameters?.['displayTraceId'] === display.id) : undefined;
      return { identity, trace };
    });
  }, [priorFile, allKnownTraces]);
  const matches = matchPriorColumns(prior.map(item => item.identity), yCols, headers, named);
  const keepIds = matches.map(index => (index >= 0 ? prior[index]?.trace?.id ?? null : null));
  const removed = prior.filter((_, index) => !matches.includes(index));
  const removedIds = removed.flatMap(item => (item.trace ? [item.trace.id] : []));
  const removedMarkers = markers.filter(marker => removed.some(item => item.trace && item.trace.name === marker.trace)).length;
  const yColors = useWizardTraceColors(keepIds, editing ? removedIds : []);
  const colors = headers.map((_, col) => { const at = yCols.indexOf(col); return at >= 0 ? yColors[at] : undefined; });

  const updateLayout = (delimiter: string, skipRows: number, valueDelimiter?: WizardConfig['valueDelimiter']) => {
    setConfig(prev => {
      const next = { ...prev, delimiter, valueDelimiter, skipRows };
      const nextLayout = wizardLayout(entry.rawText, next);
      // A new layout re-detects the roles when the old ones no longer fit.
      const fits = prev.delimiter === delimiter && prev.valueDelimiter === valueDelimiter && nextLayout.numeric.includes(prev.xCol) && prev.yCols.some(col => nextLayout.numeric.includes(col));
      const xCol = fits ? prev.xCol : nextLayout.numeric[0] ?? 0;
      const roles = fits ? { xCol: prev.xCol, yCols: prev.yCols.filter(col => col < nextLayout.headers.length) } : { xCol, yCols: nextLayout.numeric.filter(col => col !== xCol) };
      return { ...next, ...roles, headers: nextLayout.headers };
    });
  };

  const resolveDecisions = async (batchId: string, resolving: readonly WizardEntry[]) => {
    const batch = resolving.find(item => item.pendingBatch?.id === batchId)?.pendingBatch;
    const decisions: Record<string, { choice: OpenChoice; expectedFileId?: string }> = {};
    let workspaceChoice: 'replace' | undefined;
    if (!batch || !aggregate) return { ok: true as const, decisions, workspaceChoice };
    const current = aggregate.state;
    if (batch.workspace) {
      const counts = workspaceCounts(current);
      if (counts) { if (await ask(replaceWorkspaceText(counts)) !== 'confirm') return { ok: false as const }; workspaceChoice = 'replace'; }
    }
    const opened = batch.workspace?.snapshot.files ?? current.files.files;
    const names = new Set(opened.map(file => file.fileName));
    for (const input of batch.inputs) {
      const existing = opened.find(file => file.fileName === input.name);
      if (!existing || input.choice === 'copy' || (input.choice === 'replace' && input.expectedFileId === String(existing.id))) continue;
      const answer = await ask(sameNameText(input.name, copyName(input.name, names)));
      if (answer === 'cancel') return { ok: false as const };
      const choice: OpenChoice = answer === 'confirm' ? 'replace' : 'copy';
      if (choice === 'copy') names.add(copyName(input.name, names));
      decisions[input.id] = { choice, expectedFileId: choice === 'replace' ? String(existing.id) : undefined };
    }
    return { ok: true as const, decisions, workspaceChoice };
  };

  const confirm = async () => {
    if (blocker || asking.current) return;
    const resolving = [entry, ...(applyToOthers ? others : [])];
    const configs = new Map(resolving.map(item => [item.id, item === entry ? config : { ...config, headers: wizardLayout(item.rawText, config).headers }]));
    // A batch opens once all its files are resolved; ask its open questions with the last one.
    const finalFor = new Map<string, { decisions: Record<string, { choice: OpenChoice; expectedFileId?: string }>; workspaceChoice?: 'replace' }>();
    for (const item of resolving) {
      const batchId = item.pendingBatch?.id;
      if (!batchId || finalFor.has(batchId)) continue;
      const left = queue.filter(other => other.pendingBatch?.id === batchId && !resolving.includes(other));
      if (left.length) continue;
      asking.current = true;
      const answer = await resolveDecisions(batchId, resolving).finally(() => { asking.current = false; });
      if (!answer.ok) return;
      finalFor.set(batchId, { decisions: answer.decisions, workspaceChoice: answer.workspaceChoice });
    }
    resolving.forEach(item => {
      const batchId = item.pendingBatch?.id;
      const isLast = batchId ? resolving.filter(other => other.pendingBatch?.id === batchId).at(-1) === item : true;
      const extra = batchId && isLast ? finalFor.get(batchId) : undefined;
      fileDispatch({ type: 'RESOLVE_WIZARD', payload: { id: item.id, config: configs.get(item.id) ?? config, ...(extra ? { decisions: extra.decisions, workspaceChoice: extra.workspaceChoice } : {}) } });
    });
  };
  const skipFile = () => fileDispatch({ type: 'SKIP_WIZARD', payload: { id: entry.id } });
  const cancel = () => (editing ? skipFile() : fileDispatch({ type: 'SKIP_ALL_WIZARD' }));

  const confirmRef = useRef(confirm); confirmRef.current = confirm;
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || asking.current) return;
      if (event.key === 'Escape') { event.preventDefault(); cancelRef.current(); }
      else if (event.key === 'Enter' && !enterIsTaken(event.target)) { event.preventDefault(); void confirmRef.current(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const roles = headers.map((_, col) => columnRole(config, col));
  const names = headers.map((header, col) => columnDisplayName(header, roles[col] ?? 'skip', config));
  const traceNames = yCols.map(col => names[col] ?? `Column ${col + 1}`);
  const mainLabel = editing ? 'Apply' : `Add ${yCols.length} trace${yCols.length === 1 ? '' : 's'}`;
  const removedNames = removed.map(item => item.identity.header ?? `Column ${item.identity.index + 1}`);
  const removedText = removedNames.length === 0 ? null
    : `${listNames(removedNames)} ${removedNames.length === 1 ? 'is no longer a Y column: its trace' : 'are no longer Y columns: their traces'}${removedMarkers ? ` and ${removedMarkers} marker${removedMarkers === 1 ? '' : 's'}` : ''} will be removed.`;

  return (
    <div className="ui-dialog-backdrop">
      <div ref={dialogRef} className="ui-dialog iw-dialog" role="dialog" aria-modal="true" aria-labelledby="import-wizard-title" data-testid="import-wizard" tabIndex={-1}>
        <header className="iw-head">
          <h2 id="import-wizard-title" className="iw-title t-title">
            {editing ? 'Import settings' : 'Open'} <span className="iw-file" title={entry.fileName}>{entry.fileName}</span>
          </h2>
          <div className="iw-mode-switch" title="Switch between Text / CSV table import and Binary / Waveform import">
            <Segmented
              label="Import mode"
              options={[{ value: 'text', label: 'Text' }, { value: 'binary', label: 'Binary' }]}
              value="text"
              onChange={mode => { if (mode === 'binary') fileDispatch({ type: 'SWITCH_WIZARD_TO_BINARY', payload: { id: entry.id } }); }}
            />
          </div>
          {total > 1 && <span className="t-caption" data-testid="import-wizard-queue">File {position} of {total}</span>}
          <button type="button" className="iw-close" aria-label="Close" title="Cancel (Esc)" onClick={cancel}><Icon name="close" /></button>
        </header>

        <div className="iw-body">
          <WizardSettings
            config={config}
            maxSkipRows={Math.max(0, layout.lines.length - 1)}
            detected={{
              xLabel: detection.detectedXLabel,
              xUnit: detection.config.xUnit,
              score: detection.config.confidence,
              level: detection.confidenceLevel,
              reasons: detection.confidenceReasons,
            }}
            onChange={setConfig}
            onLayout={updateLayout}
          />
          <div className="iw-main">
            <div className="iw-preview-head">
              <h3 className="t-section">Preview</h3>
              <span className="t-caption" data-testid="import-wizard-caption">{previewCaption(Math.min(rowLimit, Math.max(0, layout.lines.length - config.skipRows)), Math.max(0, layout.lines.length - config.skipRows), config.skipRows)}</span>
            </div>
            <WizardPreviewTable
              lines={layout.lines}
              separators={config}
              skipRows={config.skipRows}
              rowLimit={rowLimit}
              onShowMore={() => setRowLimit(prev => prev + PREVIEW_ROWS)}
              headers={headers}
              names={names}
              roles={roles}
              colors={colors}
              numeric={layout.numeric}
              onRole={(col, role) => setConfig(prev => setColumnRole(prev, col, role))}
            />
            <WizardPreviewPlot plot={plot} colors={yColors} />
            {rangeText && (
              <div className="iw-plot-range t-readout" data-testid="import-wizard-range">{rangeText}</div>
            )}
            <div className="iw-result-row">
              {blocker ? <span /> : (
                <p className="iw-result t-caption" data-testid="import-wizard-summary">
                  Will {editing ? 'show' : 'create'} {yCols.length} trace{yCols.length === 1 ? '' : 's'}: <span className="t-card-title">{entry.fileName}</span>
                  {traceNames.map((name, index) => <span key={`${name}-${index}`}> · {name}</span>)}
                </p>
              )}
              <span className="t-caption" data-testid="import-wizard-plot-caption">{plotCaption(numericTable)}</span>
            </div>
            {editing && <MessageBar status="info">Traces whose column still exists keep their colour, markers and pane.</MessageBar>}
            {editing && removedText && <MessageBar status="warning">{removedText}</MessageBar>}
          </div>
        </div>

        <footer className="iw-foot">
          {!editing && others.length > 0 && (
            <label className="iw-check t-label">
              <input type="checkbox" checked={applyToOthers} onChange={event => setApplyToOthers(event.target.checked)} />
              Use these settings for the other {others.length === 1 ? 'file' : `${others.length} files`}
            </label>
          )}
          <span className="iw-spacer" />
          {blocker && <span className="iw-blocker t-caption" data-testid="import-wizard-blocker">{blocker}</span>}
          {!editing && total > 1 && <Btn onClick={skipFile}>Skip file</Btn>}
          <Btn onClick={cancel} title="Esc">Cancel</Btn>
          <Btn variant="solid" onClick={() => void confirm()} disabled={!!blocker} title="Enter" data-testid="import-wizard-confirm">{mainLabel}</Btn>
        </footer>
      </div>
    </div>
  );
}
