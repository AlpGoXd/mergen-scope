import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePaneState } from '../../../stores/pane-store';
import { useTraceState } from '../../../stores/trace-store';
import { useUiState } from '../../../stores/ui-store';
import { useMarkerState } from '../../../stores/marker-store';
import { useRefLineState } from '../../../stores/ref-line-store';
import { useOptionalToast } from '../../../stores/toast-store';
import { usePaneData } from '../../../hooks/use-pane-data';
import { useTraceColors } from '../../../hooks/use-trace-colors';
import { useTraceSymbols } from '../../../hooks/use-trace-symbols';
import { allocateTraceColors, traceWidth } from '../../../domain/trace-palette';
import { SYMBOL_RADIUS } from '../../../domain/dots-and-symbols';
import { paneName } from '../../../domain/line-view';
import { paneTypeOfMode } from '../../../domain/pane-type-registry';
import { formatAdaptiveXAxisValue } from '../../../domain/format';
import { latexFigure } from '../../../domain/export-latex';
import { PAPER_LINE_PT, PAPER_MARK_RADIUS_PT, PAPER_TAG_PT, exportFileName, exportGeometry, exportPhysicalSize, layoutLegend, ptToCssPx } from '../../../domain/export-image';
import type { ExportImageOptions } from '../../../domain/export-image';
import { defaultPaneSettings } from '../../../types/pane';
import { readAppPreferences } from '../../settings/app-preferences';
import { TraceSymbol } from '../../shared/TraceSymbol';
import { ChartPane } from '../ChartPane';
import { SmithPaneContainer } from '../../smith/SmithPaneContainer';
import { PaneImageExportContext } from './export-context';
import type { ExportNotice, ExportPlotInfo, ExportView, PaneImageExport } from './export-context';
import { colorThemeOf, exportFontFamily, exportThemeClass, exportTokens, PAPER_FONT_PX, resolveExportTheme, SCREEN_FONT_PX } from './export-theme';
import type { ResolvedExportTheme } from './export-theme';
import { composeExportSvg } from './export-svg';
import { cssColorToRgb, downloadBlob, svgToPng } from './export-png';
import { ExportOptionsPopover } from './ExportOptionsPopover';
import { readExportOptions } from './export-options-storage';

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
  readonly latex: string | null;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

type JobMode = 'png' | 'svg' | 'latex';

interface Job {
  readonly id: number;
  readonly paneId: string;
  readonly kind: 'chart' | 'smith';
  readonly mode: JobMode;
  readonly options: ExportImageOptions;
  readonly geometry: ReturnType<typeof exportGeometry>;
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
 * Copy image / Download image / Download SVG / Copy as LaTeX, the Options popover, the export notice and
 * Ctrl+Shift+C / S / E.
 */
export function ExportImageProvider({ children }: { children: ReactNode }) {
  const { panes, activePaneId, tracePaneMap } = usePaneState();
  const { allTraces, vis } = useTraceState();
  const { theme: appTheme } = useUiState();
  const toast = useOptionalToast();
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<ExportNotice | null>(null);
  const [options, setOptions] = useState<{ paneId: string; at: HTMLElement | { x: number; y: number } } | null>(null);
  const jobRef = useRef<Job | null>(null);
  const counter = useRef(0);
  const latest = useRef({ panes, activePaneId, tracePaneMap, allTraces, vis, appTheme });
  latest.current = { panes, activePaneId, tracePaneMap, allTraces, vis, appTheme };

  const unavailable = useCallback((paneId: string, format: 'image' | 'latex'): string | null => {
    const state = latest.current;
    const pane = state.panes.find(item => item.id === paneId);
    if (!pane) return 'The pane no longer exists';
    const type = paneTypeOfMode(pane.renderMode);
    if (type === 'table') return 'Table panes export as data (CSV)';
    if (type !== 'chart' && type !== 'smith') return 'This pane type cannot be exported yet';
    if (format === 'latex' && type !== 'chart') return 'Copy as LaTeX supports chart panes for now';
    const shown = state.allTraces.some(trace => (state.tracePaneMap[trace.name] ?? []).includes(paneId) && state.vis[trace.name] !== false);
    return shown ? null : `${paneName(state.panes, paneId)} has no traces to export`;
  }, []);

  const renderPane = useCallback((paneId: string, chosen: ExportImageOptions, mode: JobMode) => new Promise<ExportedPane>((resolve, reject) => {
    const state = latest.current;
    if (jobRef.current) { reject(new Error('Another export is still running.')); return; }
    const reason = unavailable(paneId, mode === 'latex' ? 'latex' : 'image');
    const pane = state.panes.find(item => item.id === paneId);
    if (reason || !pane) { reject(new Error(reason ?? 'The pane no longer exists')); return; }
    const element = document.querySelector(`[data-testid="chart-pane-${CSS.escape(paneId)}"]`);
    const box = element?.getBoundingClientRect() ?? { width: 800, height: 500 };
    // LaTeX takes its ranges and labels from a print render; its look is set in the .tex itself.
    const theme = mode === 'latex' ? 'print' : resolveExportTheme(chosen.theme ?? readAppPreferences().exportTheme, state.appTheme);
    const next: Job = {
      id: ++counter.current, paneId, kind: paneTypeOfMode(pane.renderMode) === 'smith' ? 'smith' : 'chart', mode, options: chosen,
      geometry: exportGeometry(chosen, { width: box.width, height: box.height }), theme, resolve, reject,
    };
    jobRef.current = next;
    setJob(next);
  }), [unavailable]);

  const finish = useCallback((id: number) => {
    if (jobRef.current?.id !== id) return;
    jobRef.current = null;
    setJob(null);
  }, []);

  const openOptions = useCallback((paneId: string, at?: HTMLElement | { x: number; y: number }) => {
    const gear = document.querySelector<HTMLElement>(`[data-testid="chart-pane-${CSS.escape(paneId)}"] .ph-gear`);
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
  const downloadLatex = useCallback((paneId: string) => download(paneId, 'latex', 'tex', result => result.latex === null ? null : new Blob([result.latex], { type: 'application/x-tex;charset=utf-8' })), [download]);

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
      const blob = mode === 'png' ? result.png : result.latex === null ? null : new Blob([result.latex], { type: 'text/plain' });
      if (!blob) throw new Error('nothing was produced');
      return blob;
    });
    payload.catch(() => { /* reported below */ });
    let write: Promise<void>;
    try { write = navigator.clipboard.write([new ClipboardItem({ [type]: payload })]); } catch (error) { write = Promise.reject(error); }
    write.then(() => {
      setNotice(null);
      toast?.show({ message: `${name} copied as ${mode === 'png' ? 'image' : 'LaTeX'}`, ...(mode === 'png' ? { action: optionsAction(paneId) } : {}) });
    }, async error => {
      const rendered = await payload.then(() => true, renderError => { setNotice({ message: `Could not export ${name}: ${reasonOf(renderError)}.`, paneId: null }); return false; });
      if (rendered) setNotice({ message: `Could not copy ${name} to the clipboard: ${reasonOf(error)}.`, paneId, fallback });
    });
  }, [renderPane, toast, optionsAction]);

  const copyImage = useCallback((paneId: string) => copy(paneId, 'png'), [copy]);
  const copyLatex = useCallback((paneId: string) => copy(paneId, 'latex'), [copy]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || event.defaultPrevented) return;
      const action = event.code === 'KeyC' ? 'copy' : event.code === 'KeyS' ? 'download' : event.code === 'KeyE' ? 'options' : null;
      if (!action || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.isContentEditable || target.closest('input, textarea, select'))) return;
      const { panes: current, activePaneId: active } = latest.current;
      const paneId = current.some(pane => pane.id === active) ? active : current[0]?.id;
      if (!paneId) return;
      event.preventDefault();
      if (action === 'copy') copyImage(paneId);
      else if (action === 'download') downloadImage(paneId);
      else openOptions(paneId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyImage, downloadImage, openOptions]);

  const value = useMemo<PaneImageExport>(() => ({
    copyImage, downloadImage, downloadSvg, copyLatex, downloadLatex, unavailable, openOptions, notice, dismissNotice: () => setNotice(null),
  }), [copyImage, downloadImage, downloadSvg, copyLatex, downloadLatex, unavailable, openOptions, notice]);

  return (
    <PaneImageExportContext.Provider value={value}>
      {children}
      {options && <ExportOptionsPopover paneName={paneName(panes, options.paneId)} at={options.at} onClose={() => setOptions(null)}
        onCopy={() => { const paneId = options.paneId; setOptions(null); copyImage(paneId); }}
        onDownload={() => { const paneId = options.paneId; setOptions(null); downloadImage(paneId); }} />}
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
  const { allKnownTraces } = useTraceState();
  const { traceHueSlots } = useUiState();
  const { markers } = useMarkerState();
  const { refLines } = useRefLineState();
  const { geometry, theme } = job;
  const colorTheme = colorThemeOf(theme);
  const names = useMemo(() => Object.entries(tracePaneMap).filter(([, ids]) => ids.includes(job.paneId)).map(([name]) => name), [tracePaneMap, job.paneId]);
  const { paneTraces } = usePaneData(names, null);
  const color = useTraceColors(colorTheme);
  const symbol = useTraceSymbols('always');
  const assignments = useMemo(() => allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))), [allKnownTraces, traceHueSlots]);
  const fontPx = geometry.paper ? PAPER_FONT_PX : SCREEN_FONT_PX;
  const fontFamily = exportFontFamily(geometry.paper);
  // Paper: symbols, dots and marker glyphs about 2.5 pt radius, tags 7.5 pt; screen sizes otherwise.
  const markScale = geometry.paper ? ptToCssPx(PAPER_MARK_RADIUS_PT) / SYMBOL_RADIUS : 1;
  const tagPx = geometry.paper ? ptToCssPx(PAPER_TAG_PT) : 11;
  const legend = useMemo(() => {
    const labels = paneTraces.map(trace => trace.dn || trace.name);
    const widths = labels.map(label => LEGEND_SAMPLE_WIDTH + LEGEND_SAMPLE_GAP + Math.ceil(textWidth(label, `${fontPx}px ${fontFamily}`)));
    const rowHeight = Math.round(fontPx * 1.6);
    return { labels, rowHeight, ...layoutLegend(widths, geometry.cssWidth, { itemGap: Math.round(fontPx * 1.5), rowHeight, padding: Math.round(fontPx * 0.5) }) };
  }, [paneTraces, fontPx, fontFamily, geometry.cssWidth]);
  const bodyHeight = Math.max(40, geometry.cssHeight - legend.height);
  const plotInfo = useRef<ExportPlotInfo | null>(null);
  const onPlot = useCallback((info: ExportPlotInfo) => { plotInfo.current = info; }, []);
  const view = useMemo<ExportView>(() => ({ width: geometry.cssWidth, height: bodyHeight, colorTheme, print: theme === 'print', paper: geometry.paper, markScale, tagPx, onPlot }),
    [geometry.cssWidth, bodyHeight, colorTheme, theme, geometry.paper, markScale, tagPx, onPlot]);
  const hostRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  // The export reads the stores as they were when it started.
  const snapshot = useRef({ paneTraces, color, symbol, markers, refLines, panes });
  snapshot.current = { paneTraces, color, symbol, markers, refLines, panes };
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
        const candidate = host?.querySelector<SVGSVGElement>(job.kind === 'chart' ? '[data-export-chart] svg.recharts-surface' : 'svg.smith-svg') ?? null;
        const box = candidate?.getBoundingClientRect();
        const drawn = job.kind === 'smith' || ((host?.querySelectorAll('[data-export-chart] .recharts-line').length ?? 0) >= traceCount && (job.mode !== 'latex' || plotInfo.current !== null));
        if (candidate && box && box.width > 0 && box.height > 0 && drawn) chart = candidate;
      }
      const host = hostRef.current;
      if (!chart || !host) throw new Error('the chart did not finish drawing');
      await nextFrame();
      if (job.mode === 'latex') {
        const latex = buildLatex(job, plotInfo.current, snapshot.current, host);
        if (import.meta.env.DEV) window.__mergenLastExportLatex = latex;
        return { svg: '', fileSvg: '', png: null, latex, pixelWidth: 0, pixelHeight: 0 };
      }
      const layers = [chart, ...host.querySelectorAll<SVGSVGElement>('svg[data-export-legend]')];
      const { cssWidth, cssHeight, pixelWidth, pixelHeight } = geometry;
      const size = exportPhysicalSize(job.options, geometry);
      const svg = await composeExportSvg({ host, layers, cssWidth, cssHeight, pixelWidth, pixelHeight, fileWidth: size.width, fileHeight: size.height });
      if (import.meta.env.DEV) window.__mergenLastExportSvg = svg.raster;
      const png = job.mode === 'png' ? await svgToPng(svg.raster, pixelWidth, pixelHeight) : null;
      return { svg: svg.raster, fileSvg: svg.file, png, latex: null, pixelWidth, pixelHeight };
    };
    run().then(job.resolve, (error: unknown) => job.reject(error instanceof Error ? error : new Error(String(error)))).finally(() => onDone(job.id));
  }, [geometry, job, onDone, traceCount]);

  const tokens = exportTokens(theme, geometry.paper);
  const lineWidth = (traceId: string): number => {
    if (geometry.paper) return ptToCssPx(PAPER_LINE_PT);
    const assignment = assignments.get(traceId);
    return assignment ? traceWidth(assignment) : 1.5;
  };
  return (
    <div ref={hostRef} aria-hidden="true" data-export-host="" data-export-theme={theme} className={exportThemeClass(theme)}
      style={{ ...tokens, position: 'fixed', left: -10000, top: 0, width: geometry.cssWidth, height: geometry.cssHeight, overflow: 'hidden', pointerEvents: 'none', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: fontPx }}>
      <div style={{ position: 'relative', width: geometry.cssWidth, height: bodyHeight, flex: 'none' }}>
        {job.kind === 'chart' ? <ChartPane paneId={job.paneId} exportView={view} /> : <SmithPaneContainer paneId={job.paneId} exportView={view} />}
      </div>
      {legend.height > 0 && <svg data-export-legend="" width={geometry.cssWidth} height={legend.height} viewBox={`0 0 ${geometry.cssWidth} ${legend.height}`} style={{ display: 'block', flex: 'none' }}>
        {paneTraces.map((trace, index) => {
          const at = legend.items[index];
          if (!at) return null;
          const traceColor = color(trace);
          const kind = symbol(trace.id);
          const mid = legend.rowHeight / 2;
          return <g key={trace.id} transform={`translate(${at.x} ${at.y})`} data-export-legend-item={trace.name}>
            <line x1={0} y1={mid} x2={LEGEND_SAMPLE_WIDTH} y2={mid} stroke={traceColor} strokeWidth={lineWidth(trace.id)} />
            {kind && <g transform={`translate(${LEGEND_SAMPLE_WIDTH / 2} ${mid}) scale(${markScale})`}><TraceSymbol kind={kind} color={traceColor} /></g>}
            <text x={LEGEND_SAMPLE_WIDTH + LEGEND_SAMPLE_GAP} y={mid} dominantBaseline="central" fill="var(--text)" fontSize={fontPx} fontFamily="var(--font-sans)">{legend.labels[index]}</text>
          </g>;
        })}
      </svg>}
    </div>
  );
}

interface StageSnapshot {
  readonly paneTraces: ReturnType<typeof usePaneData>['paneTraces'];
  readonly color: ReturnType<typeof useTraceColors>;
  readonly symbol: ReturnType<typeof useTraceSymbols>;
  readonly markers: ReturnType<typeof useMarkerState>['markers'];
  readonly refLines: ReturnType<typeof useRefLineState>['refLines'];
  readonly panes: ReturnType<typeof usePaneState>['panes'];
}

/** The pgfplots figure from what the render drew (ranges, axis titles) and the pane's traces, markers and lines. */
function buildLatex(job: Job, info: ExportPlotInfo | null, state: StageSnapshot, host: HTMLElement): string {
  if (!info?.x || !info.y) throw new Error('the chart did not report its axes');
  const pane = state.panes.find(item => item.id === job.paneId);
  const settings = { ...defaultPaneSettings(), ...pane?.settings };
  const [xMin, xMax] = info.x;
  const [yMin, yMax] = info.y;
  const first = state.paneTraces[0];
  const span = Math.max(xMax - xMin, 1e-12);
  const traceIndex = new Map(state.paneTraces.map((trace, index) => [trace.name, index]));
  return latexFigure({
    paneName: paneName(state.panes, job.paneId),
    date: new Date(),
    x: { min: xMin, max: xMax, label: info.xLabel, unit: info.xUnit },
    y: { min: yMin, max: yMax, label: info.yLabel },
    traces: state.paneTraces.map(trace => ({ name: trace.dn || trace.name, color: cssColorToRgb(state.color(trace), host), symbol: state.symbol(trace.id), data: trace.data })),
    markers: settings.showMarkers ? state.markers.flatMap((marker, index) => {
      const at = traceIndex.get(marker.trace);
      if (at === undefined) return [];
      const value = formatAdaptiveXAxisValue(marker.freq, span, { domain: first?.domain ?? 'frequency', unit: first?.units.x ?? (first?.domain === 'time' ? 's' : 'Hz') });
      return [{ label: `${marker.type === 'delta' ? 'DM' : 'M'}${index + 1} ${value}`, x: marker.freq, y: marker.amp, trace: at }];
    }) : [],
    lines: settings.showReferenceLines ? state.refLines.filter(line => line.paneIds.includes(job.paneId)).map(line => ({ type: line.type, value: line.value, label: line.label ?? (line.type === 'v' ? 'V' : 'H') })) : [],
  });
}
