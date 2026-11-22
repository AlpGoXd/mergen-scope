import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePaneState } from '../../../stores/pane-store';
import { useTraceState } from '../../../stores/trace-store';
import { useUiState } from '../../../stores/ui-store';
import { useMarkerState } from '../../../stores/marker-store';
import { useRefLineState } from '../../../stores/ref-line-store';
import { useOptionalToast } from '../../../stores/toast-store';
import { useShortcut } from '../../../stores/shortcut-store';
import { usePaneData } from '../../../hooks/use-pane-data';
import { useTraceColors } from '../../../hooks/use-trace-colors';
import { useTraceSymbols } from '../../../hooks/use-trace-symbols';
import { forcesHollowTraceSymbol } from '../../../domain/trace-colors';
import { allocateTraceColors, traceWidth } from '../../../domain/trace-palette';
import { SYMBOL_RADIUS } from '../../../domain/dots-and-symbols';
import { paneName } from '../../../domain/line-view';
import { paneTypeOfMode } from '../../../domain/pane-type-registry';
import { formatAdaptiveXAxisValue } from '../../../domain/format';
import { latexDocument } from '../../../domain/export-latex';
import { isPhase, unwrapPhase } from '../../../domain/chart/axis-scale';
import { chartGainView } from '../../../domain/chart/gain-view';
import { placeMarker } from '../../../domain/markers';
import type { LatexDocument } from '../../../domain/export-latex';
import type { ExportDocumentOptions, ExportFormat, ExportGeometry } from '../../../domain/export-document';
import { exportTraceName, groupExportLegends } from '../../../domain/export-plot';
import { splitByBand } from '../../../domain/smith/band';
import { gammaAtFrequency } from '../../../domain/smith/hit';
import { PAPER_LINE_PT, PAPER_MARK_RADIUS_PT, PAPER_TAG_PT, exportFileName, exportGeometry, exportPhysicalSize, layoutLegend, ptToCssPx, wrapLegendLabel } from '../../../domain/export-image';
import type { ExportImageOptions } from '../../../domain/export-image';
import { defaultPaneSettings } from '../../../types/pane';
import { rememberedExportTheme } from './export-theme-storage';
import { TraceSymbol } from '../../shared/TraceSymbol';
import { ChartPane } from '../ChartPane';
import { SmithPaneContainer } from '../../smith/SmithPaneContainer';
import { PolarPane } from '../../panes/PolarPane';
import type { SmithPaneTrace } from '../../smith/SmithPane';
import { PaneImageExportContext } from './export-context';
import type { ExportNotice, ExportPlotInfo, ExportView, PaneImageExport } from './export-context';
import { colorThemeOf, exportFontFamily, exportThemeClass, exportTokens, PAPER_FONT_PX, resolveExportTheme, SCREEN_FONT_PX } from './export-theme';
import type { ResolvedExportTheme } from './export-theme';
import { composeExportSvg } from './export-svg';
import type { PaperMarkerTag } from './export-svg';
import { cssColorToRgb, downloadBlob, svgToPng } from './export-png';
import { ExportOptionsPopover } from './ExportOptionsPopover';
import { readExportOptions } from './export-options-storage';
import { ExportTableSvg } from './ExportTableSvg';
import { ExportDocumentDialog } from './ExportDocumentDialog';

declare global {
  interface Window {
    /** Development only: the last exported SVG (as rasterised) and LaTeX, read by the e2e tests. */
    __mergenLastExportSvg?: string;
    __mergenLastExportLatex?: string;
  }
}

/** What an export render produced: the image (PNG and SVG file) or, for Copy as LaTeX, the figure source. */
export interface ExportedPane {
  readonly svg: string;
  readonly fileSvg: string;
  readonly png: Blob | null;
  readonly latex: LatexDocument | null;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly axes?: ExportPlotInfo | null;
  readonly markerOverflow?: boolean;
}

type JobMode = 'png' | 'svg' | 'latex';

interface Job {
  readonly id: number;
  readonly paneId: string;
  readonly kind: 'chart' | 'smith' | 'table' | 'polar';
  readonly mode: JobMode;
  readonly options: ExportImageOptions;
  readonly geometry: ExportGeometry;
  readonly document?: ExportDocumentOptions;
  readonly pdf?: boolean;
  readonly latexSize?: { width: number; height: number };
  readonly theme: ResolvedExportTheme;
  readonly resolve: (result: ExportedPane) => void;
  readonly reject: (error: Error) => void;
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error || error instanceof DOMException ? error.message : '';
  return message ? message.replace(/\.$/, '') : 'unknown error';
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/**
 * Owns pane export: renders the pane's own chart component off screen at the export size, takes its SVG and offers
 * Copy image / Download image / Download SVG / Copy as LaTeX, the Options popover, the export notice and the
 * Copy image / Download image shortcuts.
 */
/** `shortcutsOff` (embed mode): Copy image and Download image keys are taken but do nothing. */
export function ExportImageProvider({ children, shortcutsOff = false }: { children: ReactNode; shortcutsOff?: boolean }) {
  const { panes, activePaneId, tracePaneMap } = usePaneState();
  const { allTraces, vis } = useTraceState();
  const { theme: appTheme } = useUiState();
  const toast = useOptionalToast();
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<ExportNotice | null>(null);
  const [options, setOptions] = useState<{ paneId: string; at: HTMLElement | { x: number; y: number } } | null>(null);
  const [dialog, setDialog] = useState<{ paneId?: string; format?: ExportFormat } | null>(null);
  const jobRef = useRef<Job | null>(null);
  const renderQueue = useRef<Promise<unknown>>(Promise.resolve());
  const counter = useRef(0);
  const latest = useRef({ panes, activePaneId, tracePaneMap, allTraces, vis, appTheme });
  latest.current = { panes, activePaneId, tracePaneMap, allTraces, vis, appTheme };

  const unavailable = useCallback((paneId: string, format: 'image' | 'latex'): string | null => {
    const state = latest.current;
    const pane = state.panes.find(item => item.id === paneId);
    if (!pane) return 'The pane no longer exists';
    const type = paneTypeOfMode(pane.renderMode);
    if (format === 'latex' && type === 'polar') return 'Not available for Polar panes yet';
    if (format === 'latex' && type === 'table') return 'Choose CSV or an image for a Table pane';
    const shown = state.allTraces.some(trace => (state.tracePaneMap[trace.name] ?? []).includes(paneId) && state.vis[trace.name] !== false);
    return shown ? null : `${paneName(state.panes, paneId)} has no traces to export`;
  }, []);

  const renderPane = useCallback((paneId: string, chosen: ExportImageOptions, mode: JobMode, settings?: ExportDocumentOptions, geometry?: ExportGeometry, pdf?: boolean, latexSize?: Job['latexSize']) => {
    const task = renderQueue.current.then(() => new Promise<ExportedPane>((resolve, reject) => {
      const state = latest.current;
      const reason = unavailable(paneId, mode === 'latex' ? 'latex' : 'image');
      const pane = state.panes.find(item => item.id === paneId);
      const kind = pane && paneTypeOfMode(pane.renderMode);
      if (reason || (kind !== 'chart' && kind !== 'smith' && kind !== 'table' && kind !== 'polar')) { reject(new Error(reason ?? 'The pane no longer exists')); return; }
      const element = document.querySelector(`[data-testid="chart-pane-${CSS.escape(paneId)}"]`);
      const box = element?.getBoundingClientRect() ?? { width: 800, height: 500 };
      // LaTeX takes its ranges and labels from a print render; its look is set in the .tex itself.
      const theme = mode === 'latex' || pdf ? 'print' : resolveExportTheme(rememberedExportTheme(), state.appTheme);
      const next: Job = {
        id: ++counter.current, paneId, kind, mode, options: chosen,
        geometry: geometry ?? exportGeometry(chosen, { width: box.width, height: box.height }), document: settings, pdf, latexSize, theme, resolve, reject,
      };
      jobRef.current = next;
      setJob(next);
    }));
    renderQueue.current = task.then(() => {}, () => {});
    return task;
  }, [unavailable]);

  const finish = useCallback((id: number) => {
    if (jobRef.current?.id !== id) return;
    jobRef.current = null;
    setJob(null);
  }, []);

  const openOptions = useCallback((paneId: string, at?: HTMLElement | { x: number; y: number }) => {
    const gear = document.querySelector<HTMLElement>(`[data-testid="chart-pane-${CSS.escape(paneId)}"] .ph-settings`);
    setOptions({ paneId, at: at ?? gear ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 } });
  }, []);

  const optionsAction = useCallback((paneId: string) => ({
    label: 'Options…',
    // The toast may leave before the popover closes: anchor to where the button was.
    run: (anchor: HTMLElement) => { const box = anchor.getBoundingClientRect(); openOptions(paneId, { x: box.left, y: box.top - 8 }); },
  }), [openOptions]);

  const fileNameFor = useCallback((paneId: string, extension: 'png' | 'svg' | 'tex') => {
    const state = latest.current;
    const firstTrace = state.allTraces.find(trace => (state.tracePaneMap[trace.name] ?? []).includes(paneId) && state.vis[trace.name] !== false);
    return exportFileName(firstTrace?.file ?? null, paneName(state.panes, paneId), new Date(), extension);
  }, []);

  /** Render, then save the file the result gives; one toast or one notice. */
  const download = useCallback((paneId: string, mode: JobMode, extension: 'png' | 'svg' | 'tex', blobOf: (result: ExportedPane) => Blob | null) => {
    const name = paneName(latest.current.panes, paneId);
    renderPane(paneId, readExportOptions(), mode).then(result => {
      const blob = blobOf(result);
      if (!blob) throw new Error('nothing was produced');
      const fileName = fileNameFor(paneId, extension);
      downloadBlob(fileName, blob);
      setNotice(null);
      toast?.show({ message: `Saved ${fileName}`, ...(mode === 'latex' ? {} : { action: optionsAction(paneId) }) });
    }).catch(error => setNotice({ message: `Could not export ${name}: ${reasonOf(error)}.`, paneId: null }));
  }, [renderPane, fileNameFor, toast, optionsAction]);

  const downloadImage = useCallback((paneId: string) => download(paneId, 'png', 'png', result => result.png), [download]);
  const downloadSvg = useCallback((paneId: string) => download(paneId, 'svg', 'svg', result => new Blob([result.fileSvg], { type: 'image/svg+xml;charset=utf-8' })), [download]);
  const downloadLatex = useCallback((paneId: string) => download(paneId, 'latex', 'tex', result => result.latex === null ? null : new Blob([result.latex.source], { type: 'application/x-tex;charset=utf-8' })), [download]);

  /** Clipboard write that starts inside the click or key press (the item gets a promise), with one toast or one notice. */
  const copy = useCallback((paneId: string, mode: 'png' | 'latex') => {
    const name = paneName(latest.current.panes, paneId);
    const fallback = mode === 'png' ? 'image' : 'tex';
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setNotice({ message: `Could not copy ${name}: this browser cannot write ${mode === 'png' ? 'images' : 'rich text'} to the clipboard.`, paneId, fallback });
      return;
    }
    const rendering = renderPane(paneId, readExportOptions(), mode);
    rendering.catch(() => { /* reported below */ });
    const type = mode === 'png' ? 'image/png' : 'text/plain';
    const payload = rendering.then(result => {
      const blob = mode === 'png' ? result.png : result.latex === null ? null : new Blob([result.latex.source], { type: 'text/plain' });
      if (!blob) throw new Error('nothing was produced');
      return blob;
    });
    payload.catch(() => { /* reported below */ });
    let write: Promise<void>;
    try { write = navigator.clipboard.write([new ClipboardItem({ [type]: payload })]); } catch (error) { write = Promise.reject(error); }
    write.then(() => {
      setNotice(null);
      toast?.show({ message: `${name} copied as ${mode === 'png' ? 'image' : 'LaTeX'}`, ...(mode === 'png' ? { action: optionsAction(paneId) } : { action: { label: 'Options…', run: () => setDialog({ paneId, format: 'latex' }) } }) });
    }, async error => {
      const rendered = await payload.then(() => true, renderError => { setNotice({ message: `Could not export ${name}: ${reasonOf(renderError)}.`, paneId: null }); return false; });
      if (rendered) setNotice({ message: `Could not copy ${name} to the clipboard: ${reasonOf(error)}.`, paneId, fallback });
    });
  }, [renderPane, toast, optionsAction]);

  const copyImage = useCallback((paneId: string) => copy(paneId, 'png'), [copy]);
  const copyLatex = useCallback((paneId: string) => copy(paneId, 'latex'), [copy]);

  const targetPane = (): string | null => {
    const { panes: current, activePaneId: active } = latest.current;
    return current.some(pane => pane.id === active) ? active : current[0]?.id ?? null;
  };
  useShortcut('copy-image', () => { if (shortcutsOff) return; const paneId = targetPane(); if (!paneId) return false; copyImage(paneId); });
  useShortcut('download-image', () => { if (shortcutsOff) return; const paneId = targetPane(); if (!paneId) return false; downloadImage(paneId); });
  const openDialog = useCallback((paneId?: string, format?: 'csv' | 'latex') => setDialog({ paneId, format }), []);

  const value = useMemo<PaneImageExport>(() => ({
    copyImage, downloadImage, downloadSvg, copyLatex, downloadLatex, unavailable, openOptions, openDialog, notice, dismissNotice: () => setNotice(null),
  }), [copyImage, downloadImage, downloadSvg, copyLatex, downloadLatex, unavailable, openOptions, openDialog, notice]);

  return (
    <PaneImageExportContext.Provider value={value}>
      {children}
      {options && <ExportOptionsPopover paneName={paneName(panes, options.paneId)} at={options.at} onClose={() => setOptions(null)}
        onCopy={() => { const paneId = options.paneId; setOptions(null); copyImage(paneId); }}
        onDownload={() => { const paneId = options.paneId; setOptions(null); downloadImage(paneId); }} />}
      {dialog && <ExportDocumentDialog {...dialog} close={() => setDialog(null)} renderPane={renderPane} />}
      {job && createPortal(<ExportStage key={job.id} job={job} onDone={finish} />, document.body)}
    </PaneImageExportContext.Provider>
  );
}

const LEGEND_SAMPLE_WIDTH = 16;
const LEGEND_SAMPLE_GAP = 6;

let measureContext: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string): number {
  if (measureContext === undefined) measureContext = document.createElement('canvas').getContext('2d');
  if (!measureContext) return text.length * 7;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

/** The off-screen render of one pane: the pane's own chart component at the export size, and the legend below it. */
function ExportStage({ job, onDone }: { job: Job; onDone: (id: number) => void }) {
  const { tracePaneMap, panes } = usePaneState();
  const { allKnownTraces, allTraces } = useTraceState();
  const { traceHueSlots, huePalette } = useUiState();
  const { markers } = useMarkerState();
  const { refLines } = useRefLineState();
  const { geometry, theme } = job;
  const paperAppearance = job.pdf ? { ...job.document, paperFont: 'serif' as const, paperText: job.document?.paperText ?? 8 } : job.document;
  const colorTheme = colorThemeOf(theme);
  const names = useMemo(() => Object.entries(tracePaneMap).filter(([, ids]) => ids.includes(job.paneId)).map(([name]) => name), [tracePaneMap, job.paneId]);
  const { paneTraces } = usePaneData(names, null);
  const paneMembers = useMemo(() => allTraces.filter(trace => names.includes(trace.name)), [allTraces, names]);
  const paperTone = !!job.document && geometry.paper;
  const color = useTraceColors(colorTheme, paperTone);
  const symbol = useTraceSymbols('always');
  const assignments = useMemo(() => allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))), [allKnownTraces, traceHueSlots]);
  const fontPx = geometry.paper ? paperAppearance ? ptToCssPx(paperAppearance.paperText) : PAPER_FONT_PX : SCREEN_FONT_PX;
  const fontFamily = exportFontFamily(geometry.paper, paperAppearance?.paperFont);
  // Paper: symbols, dots and marker glyphs about 2.5 pt radius, tags 7.5 pt; screen sizes otherwise.
  const markScale = geometry.paper ? ptToCssPx(PAPER_MARK_RADIUS_PT) / SYMBOL_RADIUS : 1;
  const tagPx = geometry.paper ? ptToCssPx(PAPER_TAG_PT) : 11;
  const legend = useMemo(() => {
    const traces = job.document && (!job.document.include.legend || job.document.legend === 'off') ? []
      : groupExportLegends([{ id: job.paneId, traces: paneTraces }]).get(job.paneId) ?? [];
    const labels = traces.map(trace => job.document ? exportTraceName(trace, job.document.names === 'short') : trace.dn || trace.name);
    const measure = (text: string) => textWidth(text, `${fontPx}px ${fontFamily}`);
    const padding = Math.round(fontPx * 0.5);
    // A name wider than the pane wraps onto more lines instead of being cut at the pane's edge.
    const lines = labels.map(label => wrapLegendLabel(label, geometry.cssWidth - 2 * padding - LEGEND_SAMPLE_WIDTH - LEGEND_SAMPLE_GAP, measure));
    const widths = lines.map(parts => LEGEND_SAMPLE_WIDTH + LEGEND_SAMPLE_GAP + Math.ceil(Math.max(...parts.map(measure))));
    const rowHeight = Math.round(fontPx * 1.6);
    const lineHeight = Math.round(fontPx * 1.2);
    const layout = layoutLegend(widths, geometry.cssWidth, { itemGap: Math.round(fontPx * 1.5), rowHeight, padding }, lines.map(parts => Math.ceil((rowHeight + (parts.length - 1) * lineHeight) / rowHeight)));
    return { labels, lines, lineHeight, traces, rowHeight, ...layout };
  }, [job.document, job.paneId, paneTraces, fontPx, fontFamily, geometry.cssWidth]);
  const bodyHeight = Math.max(40, geometry.cssHeight - legend.height);
  const plotInfo = useRef<ExportPlotInfo | null>(null);
  const onPlot = useCallback((info: ExportPlotInfo) => { plotInfo.current = info; }, []);
  const smithTraces = useRef<readonly SmithPaneTrace[] | null>(null);
  const onSmith = useCallback((items: readonly SmithPaneTrace[]) => { smithTraces.current = items; }, []);
  const tikzStyle = !!job.document && job.mode === 'latex';
  const view = useMemo<ExportView>(() => ({ width: geometry.cssWidth, height: bodyHeight, colorTheme, print: theme === 'print', paper: geometry.paper, paperTone, tikzStyle, markScale, tagPx, labelPx: fontPx, onPlot, onSmith, appearance: job.document }),
    [geometry.cssWidth, bodyHeight, colorTheme, theme, geometry.paper, paperTone, tikzStyle, markScale, tagPx, fontPx, onPlot, onSmith, job.document]);
  const hostRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  // The export reads the stores as they were when it started.
  const snapshot = useRef({ paneTraces, paneMembers, color, symbol, markers, refLines, panes });
  snapshot.current = { paneTraces, paneMembers, color, symbol, markers, refLines, panes };
  const traceCount = paneTraces.length;

  useEffect(() => {
    // StrictMode runs effects twice; the ref survives, so the export runs once.
    if (started.current) return;
    started.current = true;
    const run = async (): Promise<ExportedPane> => {
      if (traceCount === 0) throw new Error('the pane has no visible traces');
      let chart: SVGSVGElement | null = null;
      for (let frame = 0; frame < 90 && !chart; frame += 1) {
        await nextFrame();
        const host = hostRef.current;
        const selector = { chart: '[data-export-chart] svg.recharts-surface', smith: 'svg.smith-svg', table: 'svg[data-export-table]', polar: 'svg.polar-svg' }[job.kind];
        const candidate = host?.querySelector<SVGSVGElement>(selector) ?? null;
        const box = candidate?.getBoundingClientRect();
        const drawn = job.kind !== 'chart' || ((host?.querySelectorAll('[data-export-chart] .recharts-line').length ?? 0) >= traceCount && (job.mode !== 'latex' || plotInfo.current !== null));
        if (candidate && box && box.width > 0 && box.height > 0 && drawn) chart = candidate;
      }
      const host = hostRef.current;
      if (!chart || !host) throw new Error('the chart did not finish drawing');
      await nextFrame();
      if (job.mode === 'latex' && !job.document) {
        const latex = buildLatex(job, plotInfo.current, snapshot.current, host, smithTraces.current);
        if (import.meta.env.DEV) window.__mergenLastExportLatex = latex.source;
        return { svg: '', fileSvg: '', png: null, latex, pixelWidth: 0, pixelHeight: 0 };
      }
      const layers = [chart, ...host.querySelectorAll<SVGSVGElement>('svg[data-export-legend]')];
      const { cssWidth, cssHeight, pixelWidth, pixelHeight } = geometry;
      const size = exportPhysicalSize(job.options, geometry);
      const svg = await composeExportSvg({ host, layers, cssWidth, cssHeight, pixelWidth, pixelHeight, fileWidth: size.width, fileHeight: size.height, embedFonts: !job.document });
      const latex = job.mode === 'latex' ? buildLatex(job, plotInfo.current, snapshot.current, host, smithTraces.current, svg.markerTags) : null;
      if (import.meta.env.DEV) window.__mergenLastExportSvg = svg.raster;
      const png = job.mode === 'png' ? await svgToPng(svg.raster, pixelWidth, pixelHeight) : null;
      return { svg: svg.raster, fileSvg: svg.file, png, latex, pixelWidth, pixelHeight, axes: plotInfo.current, markerOverflow: svg.markerOverflow };
    };
    run().then(result => {
      onDone(job.id);
      job.resolve(result);
    }, (error: unknown) => {
      onDone(job.id);
      job.reject(error instanceof Error ? error : new Error(String(error)));
    });
  }, [geometry, job, onDone, traceCount]);

  const tokens = exportTokens(theme, geometry.paper, paperAppearance);
  if (job.pdf) tokens['--font-mono'] = '"Courier New", Courier, monospace';
  const lineWidth = (traceId: string): number => {
    if (geometry.paper) return ptToCssPx(PAPER_LINE_PT);
    const assignment = assignments.get(traceId);
    return assignment ? traceWidth(assignment) : 1.5;
  };
  return (
    <div ref={hostRef} aria-hidden="true" data-export-host="" data-export-paper={paperTone ? '' : undefined} data-export-theme={theme} className={exportThemeClass(theme)}
      style={{ ...tokens, position: 'fixed', left: -10000, top: 0, width: geometry.cssWidth, height: geometry.cssHeight, overflow: 'hidden', pointerEvents: 'none', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: fontPx }}>
      <div style={{ position: 'relative', width: geometry.cssWidth, height: bodyHeight, flex: 'none' }}>
        {job.kind === 'chart' && <ChartPane paneId={job.paneId} exportView={view} />}
        {job.kind === 'smith' && <SmithPaneContainer paneId={job.paneId} exportView={view} />}
        {job.kind === 'polar' && <PolarPane paneId={job.paneId} exportView={view} />}
        {job.kind === 'table' && <ExportTableSvg paneId={job.paneId} view={view} fontPx={fontPx} />}
      </div>
      {legend.height > 0 && <svg data-export-legend={job.paneId} width={geometry.cssWidth} height={legend.height} viewBox={`0 0 ${geometry.cssWidth} ${legend.height}`} style={{ display: 'block', flex: 'none' }}>
        {legend.traces.map((trace, index) => {
          const at = legend.items[index];
          if (!at) return null;
          const traceColor = color(trace);
          const kind = symbol(trace.id);
          const mid = legend.rowHeight / 2;
          return <g key={trace.id} transform={`translate(${at.x} ${at.y})`} data-export-legend-item={trace.name}>
            <line x1={0} y1={mid} x2={LEGEND_SAMPLE_WIDTH} y2={mid} stroke={traceColor} strokeWidth={lineWidth(trace.id)} />
            {kind && <g transform={`translate(${LEGEND_SAMPLE_WIDTH / 2} ${mid}) scale(${markScale})`}><TraceSymbol kind={kind} color={traceColor} hollow={forcesHollowTraceSymbol(trace.kind, huePalette)} /></g>}
            <text x={LEGEND_SAMPLE_WIDTH + LEGEND_SAMPLE_GAP} y={mid} dominantBaseline="central" fill="var(--text)" fontSize={fontPx} fontFamily="var(--font-sans)">{(legend.lines[index] ?? [legend.labels[index]]).map((line, n) => <tspan key={n} x={LEGEND_SAMPLE_WIDTH + LEGEND_SAMPLE_GAP} dy={n === 0 ? 0 : legend.lineHeight}>{line}</tspan>)}</text>
          </g>;
        })}
      </svg>}
    </div>
  );
}

interface StageSnapshot {
  readonly paneTraces: ReturnType<typeof usePaneData>['paneTraces'];
  readonly paneMembers: ReturnType<typeof usePaneData>['paneTraces'];
  readonly color: ReturnType<typeof useTraceColors>;
  readonly symbol: ReturnType<typeof useTraceSymbols>;
  readonly markers: ReturnType<typeof useMarkerState>['markers'];
  readonly refLines: ReturnType<typeof useRefLineState>['refLines'];
  readonly panes: ReturnType<typeof usePaneState>['panes'];
}

/** The pgfplots figure from what the render drew (ranges, axis titles) and the pane's traces, markers and lines. */
function buildLatex(job: Job, info: ExportPlotInfo | null, state: StageSnapshot, host: HTMLElement, smith: readonly SmithPaneTrace[] | null, paperTags?: Record<string, PaperMarkerTag>): LatexDocument {
  const pane = state.panes.find(item => item.id === job.paneId);
  const settings = { ...defaultPaneSettings(), ...pane?.settings };
  const options = job.document;
  const named = (trace: StageSnapshot['paneTraces'][number]) => options ? exportTraceName(trace, options.names === 'short') : trace.dn || trace.name;
  const title = options?.include.title && options.title.trim() ? options.title.trim() : paneName(state.panes, job.paneId);
  const legend = options ? options.include.legend ? options.legend : 'off' : undefined;
  const prefix = `pane-${state.panes.findIndex(item => item.id === job.paneId) + 1}`;
  if (job.kind === 'smith') {
    if (!smith?.length) throw new Error('The Smith pane did not report any reflection traces.');
    let edge = 1;
    const traces = smith.map(trace => {
      const proposed = state.paneTraces.find(item => item.name === trace.name);
      const runs = splitByBand(trace.samples).map(run => run.samples.map(({ gamma }) => {
        edge = Math.max(edge, Math.abs(gamma.re), Math.abs(gamma.im));
        return { freq: gamma.re, amp: gamma.im };
      }));
      return { name: proposed ? named(proposed) : trace.shortName ?? trace.name, color: cssColorToRgb(trace.color, host), symbol: trace.symbol ?? null, data: [], runs };
    });
    const axis = { min: -edge * 1.05, max: edge * 1.05, label: '', unit: null };
    const markers = settings.showMarkers && options?.include.markerTags !== false ? state.markers.flatMap((marker, index) => {
      const trace = smith.findIndex(item => item.name === marker.trace);
      const samples = smith[trace]?.samples;
      const gamma = samples && gammaAtFrequency(samples, marker.freq);
      return gamma ? [{ label: `${marker.type === 'delta' ? 'DM' : 'M'}${index + 1}`, x: gamma.re, y: gamma.im, trace }] : [];
    }) : [];
    return latexDocument({ paneName: title, date: new Date(), x: axis, y: axis, traces, markers, lines: [], smithGrid: settings.smith.grid, grid: options?.grid, legend, caption: options?.include.title }, options?.latex, prefix, job.latexSize);
  }
  if (!info?.x || !info.y) throw new Error('the chart did not report its axes');
  const [xMin, xMax] = info.x;
  const [yMin, yMax] = info.y;
  const first = state.paneTraces[0];
  const span = Math.max(xMax - xMin, 1e-12);
  const traceIndex = new Map(state.paneTraces.map((trace, index) => [trace.name, index]));
  const gain = chartGainView(state.paneMembers, settings.axes?.gain);
  const gainTraces = gain.traces === state.paneMembers ? state.paneTraces
    : state.paneTraces.map(trace => gain.traces.find(item => item.name === trace.name) ?? trace);
  const displayTraces = gainTraces.map(trace => settings.axes?.phase === 'unwrapped' && isPhase(trace)
    ? { ...trace, data: unwrapPhase(trace.data, /^rad/i.test(trace.units.y ?? '') ? 2 * Math.PI : 360) } : trace);
  return latexDocument({
    paneName: title,
    date: new Date(),
    x: { min: xMin, max: xMax, label: info.xLabel, unit: info.xUnit, scale: options ? info.autoX : undefined, ticks: info.xTicks, logarithmic: info.xScale === 'log' },
    y: { min: yMin, max: yMax, label: info.yLabel, scale: options ? info.autoY : undefined, ticks: info.yTicks, logarithmic: info.yScale === 'log' },
    grid: options?.grid, legend, caption: options?.include.title, linePt: options?.paperLine, textPt: options?.paperText,
    traces: displayTraces.map(trace => ({ name: named(trace), color: cssColorToRgb(state.color(trace), host), symbol: state.symbol(trace.id), data: trace.data })),
    markers: settings.showMarkers && options?.include.markerTags !== false ? state.markers.flatMap((marker, index) => {
      const at = traceIndex.get(marker.trace);
      if (at === undefined) return [];
      const display = displayTraces[at];
      const amplitude = display && display !== state.paneTraces[at] ? placeMarker(display, marker.freq).amp : marker.amp;
      if (!Number.isFinite(amplitude) || (info.xScale === 'log' && marker.freq <= 0) || (info.yScale === 'log' && amplitude <= 0)) return [];
      const value = formatAdaptiveXAxisValue(marker.freq, span, { domain: first?.domain ?? 'frequency', unit: first?.units.x ?? (first?.domain === 'time' ? 's' : 'Hz') });
      const id = `${marker.type === 'delta' ? 'DM' : 'M'}${index + 1}`;
      const tag = paperTags?.[id];
      return [{ label: tag?.text ?? `${id} ${value}`, x: marker.freq, y: amplitude, trace: at,
        shift: paperTags ? tag ? { x: tag.dx * 0.75, y: -tag.dy * 0.75 } : null : undefined }];
    }) : [],
    lines: (options?.include.refLines ?? settings.showReferenceLines) ? state.refLines.filter(line => line.paneIds.includes(job.paneId))
      .map(line => ({ type: line.type, value: line.type === 'h' ? gain.toDisplay(line.value) : line.value, label: line.label ?? (line.type === 'v' ? 'V' : 'H') }))
      .filter(line => Number.isFinite(line.value)) : [],
  }, options?.latex, prefix, job.latexSize);
}
