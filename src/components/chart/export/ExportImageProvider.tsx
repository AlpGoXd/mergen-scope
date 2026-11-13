import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePaneState } from '../../../stores/pane-store';
import { useTraceState } from '../../../stores/trace-store';
import { useUiState } from '../../../stores/ui-store';
import { useOptionalToast } from '../../../stores/toast-store';
import { usePaneData } from '../../../hooks/use-pane-data';
import { useTraceColors } from '../../../hooks/use-trace-colors';
import { useTraceSymbols } from '../../../hooks/use-trace-symbols';
import { allocateTraceColors, traceWidth } from '../../../domain/trace-palette';
import { paneName } from '../../../domain/line-view';
import { paneTypeOfMode } from '../../../domain/pane-type-registry';
import { PAPER_LINE_PT, exportGeometry, exportImageFileName, layoutLegend, ptToCssPx } from '../../../domain/export-image';
import type { ExportImageOptions } from '../../../domain/export-image';
import { readAppPreferences } from '../../settings/app-preferences';
import { TraceSymbol } from '../../shared/TraceSymbol';
import { ChartPane } from '../ChartPane';
import { SmithPaneContainer } from '../../smith/SmithPaneContainer';
import { PaneImageExportContext } from './export-context';
import type { ExportNotice, ExportView, PaneImageExport } from './export-context';
import { colorThemeOf, exportFontFamily, exportTokens, PAPER_FONT_PX, resolveExportTheme, SCREEN_FONT_PX } from './export-theme';
import type { ResolvedExportTheme } from './export-theme';
import { composeExportSvg } from './export-svg';
import { downloadBlob, svgToPng } from './export-png';
import { ExportOptionsPopover } from './ExportOptionsPopover';
import { readExportOptions } from './export-options-storage';

declare global {
  interface Window {
    /** Development only: the last exported SVG, read by the e2e tests. */
    __mergenLastExportSvg?: string;
  }
}

export interface ExportedImage { readonly svg: string; readonly png: Blob; readonly pixelWidth: number; readonly pixelHeight: number }

interface Job {
  readonly id: number;
  readonly paneId: string;
  readonly kind: 'chart' | 'smith';
  readonly geometry: ReturnType<typeof exportGeometry>;
  readonly theme: ResolvedExportTheme;
  readonly resolve: (image: ExportedImage) => void;
  readonly reject: (error: Error) => void;
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error || error instanceof DOMException ? error.message : '';
  return message ? message.replace(/\.$/, '') : 'unknown error';
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/**
 * Owns pane image export: renders the pane's own chart component off screen at the export size, takes its SVG,
 * and offers Copy image / Download image, the Options popover, the export notice and Ctrl+Shift+C / S / E.
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

  const renderPane = useCallback((paneId: string, chosen: ExportImageOptions) => new Promise<ExportedImage>((resolve, reject) => {
    const state = latest.current;
    if (jobRef.current) { reject(new Error('Another image export is still running.')); return; }
    const pane = state.panes.find(item => item.id === paneId);
    if (!pane) { reject(new Error('The pane no longer exists.')); return; }
    const type = paneTypeOfMode(pane.renderMode);
    if (type !== 'chart' && type !== 'smith') { reject(new Error('Image export supports chart and Smith panes.')); return; }
    const element = document.querySelector(`[data-testid="chart-pane-${CSS.escape(paneId)}"]`);
    const box = element?.getBoundingClientRect() ?? { width: 800, height: 500 };
    const next: Job = {
      id: ++counter.current, paneId, kind: type, geometry: exportGeometry(chosen, { width: box.width, height: box.height }),
      theme: resolveExportTheme(chosen.theme ?? readAppPreferences().exportTheme, state.appTheme), resolve, reject,
    };
    jobRef.current = next;
    setJob(next);
  }), []);

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

  const downloadImage = useCallback((paneId: string) => {
    const state = latest.current;
    const name = paneName(state.panes, paneId);
    const firstTrace = state.allTraces.find(trace => (state.tracePaneMap[trace.name] ?? []).includes(paneId) && state.vis[trace.name] !== false);
    renderPane(paneId, readExportOptions()).then(image => {
      const fileName = exportImageFileName(firstTrace?.file ?? null, name, new Date());
      downloadBlob(fileName, image.png);
      setNotice(null);
      toast?.show({ message: `Saved ${fileName}`, action: optionsAction(paneId) });
    }, error => setNotice({ message: `Could not export ${name}: ${reasonOf(error)}.`, paneId: null }));
  }, [renderPane, toast, optionsAction]);

  const copyImage = useCallback((paneId: string) => {
    const name = paneName(latest.current.panes, paneId);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setNotice({ message: `Could not copy ${name}: this browser cannot copy images.`, paneId });
      return;
    }
    const rendering = renderPane(paneId, readExportOptions());
    rendering.catch(() => { /* reported below */ });
    let write: Promise<void>;
    // The item gets a promise so the write starts inside the click or key press that asked for it.
    try { write = navigator.clipboard.write([new ClipboardItem({ 'image/png': rendering.then(image => image.png) })]); } catch (error) { write = Promise.reject(error); }
    write.then(() => {
      setNotice(null);
      toast?.show({ message: `${name} copied as image`, action: optionsAction(paneId) });
    }, async error => {
      const rendered = await rendering.then(() => true, renderError => { setNotice({ message: `Could not export ${name}: ${reasonOf(renderError)}.`, paneId: null }); return false; });
      if (rendered) setNotice({ message: `Could not copy ${name} to the clipboard: ${reasonOf(error)}.`, paneId });
    });
  }, [renderPane, toast, optionsAction]);

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

  const value = useMemo<PaneImageExport>(() => ({ copyImage, downloadImage, openOptions, notice, dismissNotice: () => setNotice(null) }), [copyImage, downloadImage, openOptions, notice]);

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
  const { geometry, theme } = job;
  const colorTheme = colorThemeOf(theme);
  const names = useMemo(() => Object.entries(tracePaneMap).filter(([, ids]) => ids.includes(job.paneId)).map(([name]) => name), [tracePaneMap, job.paneId]);
  const { paneTraces } = usePaneData(names, null);
  const color = useTraceColors(colorTheme);
  const symbol = useTraceSymbols('always');
  const assignments = useMemo(() => allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))), [allKnownTraces, traceHueSlots]);
  const fontPx = geometry.paper ? PAPER_FONT_PX : SCREEN_FONT_PX;
  const fontFamily = exportFontFamily(geometry.paper);
  const legend = useMemo(() => {
    const labels = paneTraces.map(trace => trace.dn || trace.name);
    const widths = labels.map(label => LEGEND_SAMPLE_WIDTH + LEGEND_SAMPLE_GAP + Math.ceil(textWidth(label, `${fontPx}px ${fontFamily}`)));
    const rowHeight = Math.round(fontPx * 1.6);
    return { labels, rowHeight, ...layoutLegend(widths, geometry.cssWidth, { itemGap: Math.round(fontPx * 1.5), rowHeight, padding: Math.round(fontPx * 0.5) }) };
  }, [paneTraces, fontPx, fontFamily, geometry.cssWidth]);
  const bodyHeight = Math.max(40, geometry.cssHeight - legend.height);
  const view = useMemo<ExportView>(() => ({ width: geometry.cssWidth, height: bodyHeight, colorTheme, print: theme === 'print', paper: geometry.paper }), [geometry.cssWidth, bodyHeight, colorTheme, theme, geometry.paper]);
  const hostRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const traceCount = paneTraces.length;
  const paneExists = panes.some(pane => pane.id === job.paneId);

  useEffect(() => {
    // StrictMode runs effects twice; the ref survives, so the export runs once.
    if (started.current) return;
    started.current = true;
    const run = async (): Promise<ExportedImage> => {
      if (!paneExists) throw new Error('The pane no longer exists');
      if (traceCount === 0) throw new Error('the pane has no visible traces');
      let chart: SVGSVGElement | null = null;
      for (let frame = 0; frame < 90 && !chart; frame += 1) {
        await nextFrame();
        const host = hostRef.current;
        const candidate = host?.querySelector<SVGSVGElement>(job.kind === 'chart' ? '[data-export-chart] svg.recharts-surface' : 'svg.smith-svg') ?? null;
        const box = candidate?.getBoundingClientRect();
        const drawn = job.kind === 'smith' || (host?.querySelectorAll('[data-export-chart] .recharts-line').length ?? 0) >= traceCount;
        if (candidate && box && box.width > 0 && box.height > 0 && drawn) chart = candidate;
      }
      const host = hostRef.current;
      if (!chart || !host) throw new Error('the chart did not finish drawing');
      await nextFrame();
      const layers = [chart, ...host.querySelectorAll<SVGSVGElement>('svg[data-export-legend]')];
      const { cssWidth, cssHeight, pixelWidth, pixelHeight } = geometry;
      const svg = await composeExportSvg({ host, layers, cssWidth, cssHeight, pixelWidth, pixelHeight });
      if (import.meta.env.DEV) window.__mergenLastExportSvg = svg;
      const png = await svgToPng(svg, pixelWidth, pixelHeight);
      return { svg, png, pixelWidth, pixelHeight };
    };
    run().then(job.resolve, (error: unknown) => job.reject(error instanceof Error ? error : new Error(String(error)))).finally(() => onDone(job.id));
  }, [geometry, job, onDone, paneExists, traceCount]);

  const tokens = exportTokens(theme, geometry.paper);
  const lineWidth = (traceId: string): number => {
    if (geometry.paper) return ptToCssPx(PAPER_LINE_PT);
    const assignment = assignments.get(traceId);
    return assignment ? traceWidth(assignment) : 1.5;
  };
  return (
    <div ref={hostRef} aria-hidden="true" data-export-host=""
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
            {kind && <g transform={`translate(${LEGEND_SAMPLE_WIDTH / 2} ${mid})`}><TraceSymbol kind={kind} color={traceColor} /></g>}
            <text x={LEGEND_SAMPLE_WIDTH + LEGEND_SAMPLE_GAP} y={mid} dominantBaseline="central" fill="var(--text)" fontSize={fontPx} fontFamily="var(--font-sans)">{legend.labels[index]}</text>
          </g>;
        })}
      </svg>}
    </div>
  );
}
