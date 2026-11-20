import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Btn } from '../../shared/Btn';
import { DEFAULT_DOCUMENT_OPTIONS, documentFileName, PAPER_HEIGHT_MM } from '../../../domain/export-document';
import type { ExportDocumentOptions, ExportFormat, ExportScope } from '../../../domain/export-document';
import { paneName } from '../../../domain/line-view';
import { paneTypeOfMode } from '../../../domain/pane-type-registry';
import { useOptionalToast } from '../../../stores/toast-store';
import { useCenteredDialog } from '../../../hooks/use-centered-dialog';
import { downloadBlob } from './export-png';
import { exportDocumentBlob, useDocumentExport } from './use-document-export';
import type { ExportPreview, RenderExportPane } from './use-document-export';
import './export-dialog.css';

const FORMATS = { png: 'PNG', svg: 'SVG', pdf: 'PDF', latex: 'TikZ', csv: 'CSV' } as const;
const STORAGE_KEY = 'mergen-export-document-options';
const PDF_AVAILABLE = () => window.location.protocol !== 'file:';
const isPaper = (preset: ExportDocumentOptions['preset']) => preset === 'ieee-1' || preset === 'ieee-2';

function readSettings(): Partial<Record<ExportFormat, ExportDocumentOptions>> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

function savedOptions(settings: ReturnType<typeof readSettings>, format: ExportFormat): ExportDocumentOptions {
  const saved = settings[format];
  return { ...DEFAULT_DOCUMENT_OPTIONS, ...saved, include: { ...DEFAULT_DOCUMENT_OPTIONS.include, ...saved?.include },
    axisTitles: saved?.axisTitles === 'edit' || saved?.axisTitles === 'off' ? saved.axisTitles : 'auto',
    legend: saved?.legend === 'off' ? 'off' : 'below',
    latex: { ...DEFAULT_DOCUMENT_OPTIONS.latex, ...saved?.latex, points: saved?.latex?.points === 'all' ? 'all' : '2000',
      width: saved?.preset === 'ieee-2' ? 'two-column' : 'column' },
    ...(format === 'pdf' || format === 'latex' ? { preset: saved?.preset === 'ieee-2' ? 'ieee-2' : 'ieee-1', paperFont: 'serif', theme: 'print' } as const : {}),
  };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="exd-row"><span className="t-label">{label}</span><div className="exd-controls" role="group" aria-label={label}>{children}</div></div>;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <fieldset className="exd-section"><legend className="t-section">{label}</legend>{children}</fieldset>;
}

function Choice<T extends string | number>({ value, choices, onChange }: {
  value: T; choices: readonly (readonly [T, string, string?])[]; onChange: (value: T) => void;
}) {
  return choices.map(([key, label, reason]) => <Btn key={key} small variant="slate" type="button" active={value === key} aria-pressed={value === key}
    aria-disabled={reason ? true : undefined} title={reason} onClick={() => { if (!reason) onChange(key); }}>{label}</Btn>);
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <input className="exd-num t-readout" aria-label={label} type="number" min={min} max={max} step={step} required value={Number.isFinite(value) ? value : ''}
    onChange={event => onChange(event.target.valueAsNumber)} />;
}

interface PreviewState { key: string; result?: ExportPreview; error?: string }

export function ExportDocumentDialog({ paneId, format: requestedFormat = 'png', close, renderPane }: {
  paneId?: string; format?: ExportFormat; close: () => void; renderPane: RenderExportPane;
}) {
  const { panes, activePaneId, allTraces, tracePaneMap, vis, render } = useDocumentExport(renderPane);
  const [scopeChoice, setScope] = useState<ExportScope | null>(null);
  const [picked, setPicked] = useState<string[]>(paneId ? [paneId] : panes.map(pane => pane.id));
  const [format, setFormat] = useState<ExportFormat>(requestedFormat);
  const scope = scopeChoice ?? (paneId && format !== 'csv' ? 'pane' : 'all');
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [prefs, setPrefs] = useState(readSettings);
  const [revision, setRevision] = useState<PreviewState | null>(null);
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => new Date());
  const ref = useCenteredDialog(true);
  const latestRender = useRef(render);
  latestRender.current = render;
  const toast = useOptionalToast();
  const options = savedOptions(prefs, format);
  const currentPane = paneId ?? activePaneId ?? panes[0]?.id;
  const ids = scope === 'all' ? panes.map(pane => pane.id) : scope === 'pane' ? (currentPane ? [currentPane] : []) : picked;
  const named = ids.length === 1 ? paneName(panes, ids[0]!) : scope === 'pick' ? 'Selected panes' : 'All panes';
  const firstTrace = allTraces.find(trace => ids.some(id => tracePaneMap[trace.name]?.includes(id)) && (vis[trace.name] !== false || options.csvTraces === 'all'));
  const ext = format === 'latex' ? options.latex.data === 'zip' ? 'zip' : 'tex' : format;
  const filename = documentFileName(options.filename, firstTrace?.file, named, now, ext);
  const paperPreset = isPaper(options.preset) ? options.preset as keyof typeof PAPER_HEIGHT_MM : null;
  const paper = paperPreset !== null;
  const paperHeight = paperPreset ? options.paperHeight[paperPreset] ?? PAPER_HEIGHT_MM[paperPreset] : 0;
  const titleVisible = options.figureTitle ?? !paper;
  const image = format !== 'csv' && format !== 'latex';
  const smithSelected = panes.some(pane => ids.includes(pane.id) && paneTypeOfMode(pane.renderMode) === 'smith');
  const titlePanes = panes.filter(pane => ids.includes(pane.id) && paneTypeOfMode(pane.renderMode) === 'chart');
  const dimensionsValid = options.preset !== 'custom' || (options.width >= 160 && options.width <= 4096 && options.height >= 160 && options.height <= 4096);
  const pdfReason = !PDF_AVAILABLE() ? 'Open the app through a local or hosted web server to use PDF' : undefined;
  const smithNote = "Smith panes aren't in TikZ yet";
  const latexReason = titlePanes.length ? undefined : smithSelected ? smithNote : 'Select a Chart pane';
  const blocked = format === 'pdf' && pdfReason || format === 'latex' && latexReason ||
    format !== 'csv' && paper && !(paperHeight >= 30 && paperHeight <= 500) && 'Enter a paper height from 30 to 500 mm.' ||
    image && !dimensionsValid && 'Enter dimensions from 160 to 4096 px.' || undefined;
  const key = JSON.stringify({ ids, format, options });
  const result = revision?.key === key ? revision.result : undefined;
  const previewError = blocked || (revision?.key === key ? revision.error : '');

  useEffect(() => {
    if (blocked) return;
    const controller = new AbortController();
    const request = JSON.parse(key) as { ids: string[]; format: ExportFormat; options: ExportDocumentOptions };
    const timer = setTimeout(() => {
      latestRender.current(request.ids, request.format, request.options, now, controller.signal).then(next => {
        if (!controller.signal.aborted) setRevision({ key, result: next });
      }, (error: unknown) => {
        if (!controller.signal.aborted) setRevision({ key, error: error instanceof Error ? error.message : String(error) });
      });
    }, 140);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, blocked, now]);

  const visibleFigure = result?.kind === 'image' ? result : result?.figure;
  const previewUrl = usePreviewUrl(visibleFigure?.svg);
  const saveLabel = format === 'latex' ? (ext === 'zip' ? 'Save ZIP' : 'Save .tex') : 'Save ' + FORMATS[format];
  const copyLabel = format === 'latex' ? 'Copy LaTeX' : format === 'csv' ? 'Copy data' : 'Copy image';
  const change = (patch: Partial<ExportDocumentOptions>) => {
    setActionError('');
    setPrefs(previous => {
      const next = { ...previous, [format]: { ...savedOptions(previous, format), ...patch } };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Settings remain available in this session. */ }
      return next;
    });
  };
  const changeLatex = (patch: Partial<ExportDocumentOptions['latex']>) => change({ latex: { ...options.latex, ...patch } });
  const editTitle = (id: string, axis: 'x' | 'y', text: string) => {
    const entry = options.paneTitles[id] ?? { x: '', y: '' };
    change({ paneTitles: { ...options.paneTitles, [id]: { ...entry, [axis]: text } } });
  };
  const titleInputs = (id: string) => (['x', 'y'] as const).map(axis => {
    const upper = axis.toUpperCase();
    const auto = visibleFigure?.axes[id]?.[axis === 'x' ? 'autoX' : 'autoY']?.title;
    return <input key={axis} className="t-label" type="text" aria-label={`${paneName(panes, id)} ${upper} title`} placeholder={auto ?? 'Auto from units'}
      value={options.paneTitles[id]?.[axis] ?? ''} maxLength={80} onChange={event => editTitle(id, axis, event.target.value)} />;
  });

  const save = async () => {
    if (!result || saving) return;
    setSaving(true);
    setActionError('');
    try {
      downloadBlob(filename, await exportDocumentBlob(result, format, options, filename));
      toast?.show({ message: `Saved ${filename}` });
      close();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The file could not be saved.');
      setSaving(false);
    }
  };
  const copy = async () => {
    if (!result || saving) return;
    setActionError('');
    try {
      if (result.kind === 'text') {
        await navigator.clipboard.writeText(format === 'csv' ? result.makeCsv?.() ?? result.text : result.text);
      } else {
        const png = exportDocumentBlob(result, 'png', options, filename);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      }
      toast?.show({ message: `${named} copied as ${image ? 'image' : FORMATS[format]}` });
    } catch (error) {
      setActionError(error instanceof Error ? `Could not copy: ${error.message}` : 'Clipboard access is unavailable.');
    }
  };

  return createPortal(
    <dialog className="exd ui-dialog" ref={ref} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="export-dialog-title" onCancel={event => { event.preventDefault(); if (!saving) close(); }}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && !(event.target instanceof HTMLElement && event.target.closest('[data-enter-action], [role="tab"]'))) {
          event.preventDefault();
          void save();
        }
      }}>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <header className="exd-head">
          <h2 className="t-title" id="export-dialog-title">Export · {named}</h2>
          <Btn small aria-label="Close export" title="Close (Esc)" onClick={close} disabled={saving} data-enter-action="">×</Btn>
        </header>
        <div className="exd-body">
          <section className="exd-preview" aria-label="Live preview" aria-busy={!result && !previewError}>
            {format === 'latex' && <div className="exd-preview-tabs" role="tablist" aria-label="TikZ preview">
              {(['preview', 'code'] as const).map(key => <Btn key={key} small variant="slate" role="tab" id={`exd-tab-${key}`} aria-controls="exd-preview-content"
                aria-selected={tab === key} active={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}
                onKeyDown={event => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  const next = key === 'code' ? 'preview' : 'code';
                  setTab(next);
                  document.getElementById(`exd-tab-${next}`)?.focus();
                }}>{key === 'preview' ? 'Preview' : 'Code'}</Btn>)}
              {tab === 'code' && <Btn small onClick={() => void copy()} disabled={!result || saving} data-enter-action="">Copy</Btn>}
            </div>}
            <div id="exd-preview-content" className={`exd-preview-content${result?.kind === 'text' && (format === 'csv' || tab === 'code') ? ' exd-code-preview' : ''}`}
              role={format === 'latex' ? 'tabpanel' : undefined} aria-labelledby={format === 'latex' ? `exd-tab-${tab}` : undefined}>
              {previewUrl && visibleFigure && (format !== 'latex' || tab === 'preview') && <>
                <img src={previewUrl} alt={`Export preview of ${named}`} />
                <p className="t-caption">{format === 'latex' ? 'Approximate preview: LaTeX draws the final figure.' : visibleFigure.geometry.paper
                  ? `${options.preset === 'ieee-1' ? '88.9' : '181.9'} × ${paperHeight} mm`
                  : `${visibleFigure.geometry.pixelWidth} × ${visibleFigure.geometry.pixelHeight} px`}</p>
              </>}
              {result?.kind === 'text' && (format === 'csv' || tab === 'code') && <pre className="t-readout" tabIndex={0}>{result.text}</pre>}
              {!result && <p className="t-label" role={previewError ? 'status' : undefined}>{previewError || 'Rendering preview…'}</p>}
              {format === 'latex' && smithSelected && previewError !== smithNote && <p role="status" className="t-caption">{smithNote}</p>}
              {visibleFigure?.markerOverflow && <p role="status" className="t-caption">Labels overlap; try Marker table</p>}
            </div>
          </section>
          <section className="exd-settings" aria-label="Export options">
            <Section label="Figure">
            <Row label="What"><Choice value={scope} onChange={setScope} choices={[['pane', 'This pane'], ['all', 'All panes'], ['pick', 'Pick…']]} /></Row>
            {scope === 'pick' && <div className="exd-checks" role="group" aria-label="Pick panes">
              {panes.map(pane => <label key={pane.id} className="t-label"><input type="checkbox" checked={picked.includes(pane.id)}
                onChange={event => setPicked(previous => event.target.checked ? [...previous, pane.id] : previous.filter(id => id !== pane.id))} />{paneName(panes, pane.id)}</label>)}
            </div>}
            <Row label="Format"><Choice value={format} onChange={value => { setFormat(value); setTab('preview'); setActionError(''); }}
              choices={[['png', 'PNG'], ['svg', 'SVG'], ['pdf', 'PDF', pdfReason], ['latex', 'TikZ', latexReason], ['csv', 'CSV']]} /></Row>
            {format !== 'csv' && <>
              <Row label="Size"><Choice value={options.preset} onChange={preset => {
                change(format === 'latex' ? { preset, latex: { ...options.latex, width: preset === 'ieee-2' ? 'two-column' : 'column' } } : { preset });
              }} choices={[
                ...(format === 'pdf' || format === 'latex' ? [] : [['screen', 'Screen'], ['slide', 'Slide'], ['report', 'Report'], ['custom', 'Custom']] as const),
                ['ieee-1', 'Paper 1-col'], ['ieee-2', 'Paper 2-col'],
              ]} />
                {paperPreset && <label className="exd-height t-caption">Height (mm) <NumberField label="Height (mm)" value={paperHeight} min={30} max={500} step={0.1}
                  onChange={value => change({ paperHeight: { ...options.paperHeight, [paperPreset]: value } })} /></label>}
              </Row>
              {options.preset === 'custom' && <Row label="Pixels">
                <NumberField label="Width in pixels" value={options.width} min={160} max={4096} onChange={width => change({ width })} />
                <span aria-hidden="true">×</span><NumberField label="Height in pixels" value={options.height} min={160} max={4096} onChange={height => change({ height })} />
              </Row>}
              {format === 'png' && (paper
                ? <Row label="Resolution"><Choice value={options.dpi} onChange={dpi => change({ dpi })} choices={[[150, '150 dpi'], [300, '300 dpi'], [600, '600 dpi']]} /></Row>
                : <Row label="Scale"><Choice value={options.scale} onChange={scale => change({ scale })} choices={[[1, '1×'], [2, '2×'], [3, '3×']]} /></Row>)}
              {!paper && <Row label="Theme"><Choice value={options.theme ?? 'default'} onChange={theme => change({ theme: theme === 'default' ? null : theme })}
                choices={[['default', 'Default'], ['print', 'Print'], ['dark', 'Dark'], ['app', 'As app']]} /></Row>}
            </>}
            </Section>
            {format === 'csv' ? <Section label="Include">
              <Row label="Range"><Choice value={options.csvRange} onChange={csvRange => change({ csvRange })} choices={[['full', 'Full data'], ['visible', 'Visible X range']]} /></Row>
              <Row label="Traces"><Choice value={options.csvTraces} onChange={csvTraces => change({ csvTraces })} choices={[['visible', 'Visible only'], ['all', 'All traces']]} /></Row>
              <label className="exd-check t-label"><input type="checkbox" checked={options.csvMarkers} onChange={event => change({ csvMarkers: event.target.checked })} />Include markers</label>
            </Section> : <>
              {paper && <Section label="Text and lines">
                  {format === 'pdf' ? <p className="t-caption exd-format-note">IEEE paper size · standard Times and Courier fonts</p> :
                    format !== 'latex' && <Row label="Font"><Choice value={options.paperFont} onChange={paperFont => change({ paperFont })} choices={[['serif', 'Serif'], ['sans', 'Sans']]} /></Row>}
                  <Row label="Text size"><Choice value={options.paperText} onChange={paperText => change({ paperText })} choices={[[8, '8 pt'], [9, '9 pt'], [10, '10 pt']]} /></Row>
                  <Row label="Lines"><Choice value={options.paperLine} onChange={paperLine => change({ paperLine })} choices={[[0.5, '0.5 pt'], [0.75, '0.75 pt'], [1, '1 pt']]} /></Row>
              </Section>}
              <Section label="Include">
                <div className="exd-checks">
                  {([['markerTags', 'Marker tags'], ['markerTable', 'Marker table'], ['refLines', 'Ref lines'], ['date', 'Date']] as const)
                    .filter(([key]) => image || key !== 'date')
                    .map(([key, label]) => <label className="t-label" key={key}><input type="checkbox" checked={options.include[key]}
                      onChange={event => change({ include: { ...options.include, [key]: event.target.checked } })} />{label}</label>)}
                  <label className="t-label"><input type="checkbox" checked={options.grid} onChange={event => change({ grid: event.target.checked })} />Grid</label>
                </div>
                {format === 'latex' && <>
                  <Row label="Wrap"><Choice value={options.latex.wrap} onChange={wrap => changeLatex({ wrap })} choices={[['figure', 'Figure + caption'], ['picture', 'TikZ picture only']]} /></Row>
                  <Row label="Points"><Choice value={options.latex.points} onChange={points => changeLatex({ points })} choices={[['all', 'All'], ['2000', 'Up to 2,000']]} /></Row>
                  <Row label="Colours"><Choice value={options.latex.colors} onChange={colors => changeLatex({ colors })} choices={[['trace', 'Trace colours'], ['grayscale', 'Grayscale']]} /></Row>
                </>}
              </Section>
              <Section label="Labels">
                <Row label="Title"><label className="exd-check t-label"><input type="checkbox" checked={titleVisible} onChange={event => change({ figureTitle: event.target.checked })} />Figure title</label>
                  {titleVisible && <input className="t-label" type="text" aria-label="Figure title text" value={options.title} placeholder={named}
                    maxLength={160} onChange={event => change({ title: event.target.value })} />}</Row>
                {titlePanes.length > 0 && <Row label="Axis titles"><Choice value={options.axisTitles} onChange={axisTitles => change({ axisTitles })}
                  choices={[['auto', 'Auto from units'], ['edit', 'Edit per pane'], ['off', 'Off']]} /></Row>}
                {options.axisTitles === 'edit' && (scope === 'pane' ? titlePanes.map(pane => <div key={pane.id} className="exd-axis-fields">{titleInputs(pane.id)}</div>) :
                  <table className="exd-axis-table t-label">
                    <thead><tr><th>Pane</th><th>X title</th><th>Y title</th></tr></thead>
                    <tbody>{titlePanes.map(pane => <tr key={pane.id}><th scope="row" title={paneName(panes, pane.id)}>{paneName(panes, pane.id)}</th>
                      {titleInputs(pane.id).map(input => <td key={input.key}>{input}</td>)}</tr>)}</tbody>
                  </table>)}
                <Row label="Legend"><Choice value={options.include.legend && options.legend !== 'off' ? 'below' : 'off'}
                  onChange={legend => change({ legend, include: { ...options.include, legend: legend !== 'off' } })} choices={[['below', 'Below each pane'], ['off', 'Off']]} /></Row>
                {options.include.legend && options.legend !== 'off' && <Row label="Names"><Choice value={options.names} onChange={names => change({ names })} choices={[['full', 'Full'], ['short', 'Short (16)']]} /></Row>}
              </Section>
            </>}
            <Section label="File">
            {format === 'latex' && <Row label="Data"><Choice value={options.latex.data} onChange={data => changeLatex({ data })} choices={[['inline', 'Inline'], ['zip', '.dat files (ZIP)']]} /></Row>}
            <Row label="File name"><input className="t-readout" aria-label="File name pattern" value={options.filename} maxLength={160}
              onChange={event => change({ filename: event.target.value })} /></Row>
            <p className="exd-filename t-caption" title={filename}>{filename}</p>
            </Section>
          </section>
        </div>
        <footer className="exd-foot">
          {actionError && <span className="t-caption" role="alert">{actionError}</span>}
          <Btn small onClick={close} disabled={saving} data-enter-action="">Cancel</Btn>
          {format !== 'pdf' && <Btn small onClick={() => void copy()} disabled={!result || saving} data-enter-action="">{copyLabel}</Btn>}
          <Btn small type="submit" variant="solid" disabled={!result || saving}>{saving ? 'Saving…' : saveLabel}</Btn>
        </footer>
      </form>
    </dialog>, document.body,
  );
}

function usePreviewUrl(svg: string | undefined): string | undefined {
  const [preview, setPreview] = useState<{ svg: string; url: string }>();
  useEffect(() => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    setPreview({ svg, url });
    return () => URL.revokeObjectURL(url);
  }, [svg]);
  return preview?.svg === svg ? preview?.url : undefined;
}
