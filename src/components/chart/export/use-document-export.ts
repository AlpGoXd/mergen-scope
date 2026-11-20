import { useRef } from 'react';
import { composeSheet, sheetLayout } from './export-sheet';
import { usePaneState } from '../../../stores/pane-store';
import { useTraceState } from '../../../stores/trace-store';
import { useMarkerState } from '../../../stores/marker-store';
import { useRefLineState } from '../../../stores/ref-line-store';
import { useUiState } from '../../../stores/ui-store';
import { useOptionalAggregateWorkspace } from '../../../stores/aggregate-workspace-store';
import { linkedPeers } from '../../../domain/x-link';
import { paneTypeOfMode } from '../../../domain/pane-type-registry';
import { paneName } from '../../../domain/line-view';
import { exportGroupLayout, exportTraceName } from '../../../domain/export-plot';
import { documentCsv, documentGeometry } from '../../../domain/export-document';
import type { ExportBox, ExportDocumentOptions, ExportFormat, ExportGeometry } from '../../../domain/export-document';
import type { ExportImageOptions } from '../../../domain/export-image';
import { exportZip } from '../../../domain/export-zip';
import { latexMarkerTable, latexPaneLayout } from '../../../domain/export-latex';
import type { LatexDocument } from '../../../domain/export-latex';
import type { ExportedPane } from './ExportImageProvider';
import { exportThemeClass, exportTokens, resolveExportTheme } from './export-theme';
import { readAppPreferences } from '../../settings/app-preferences';
import { svgToPng } from './export-png';
import type { ExportPlotInfo } from './export-context';

export type RenderExportPane = (paneId: string, options: ExportImageOptions, mode: 'svg' | 'latex', settings: ExportDocumentOptions, geometry: ExportGeometry, pdf?: boolean, latexSize?: { width: number; height: number }) => Promise<ExportedPane>;

interface FigurePreview { svg: string; geometry: ExportGeometry; axes: Record<string, ExportPlotInfo>; markerOverflow: boolean }
export type ExportPreview =
  | ({ kind: 'image' } & FigurePreview)
  | { kind: 'text'; text: string; files?: readonly { name: string; text: string }[]; makeCsv?: () => string; figure?: FigurePreview };

function paneBox(id: string, index: number): ExportBox {
  const pane = document.querySelector(`[data-testid="chart-pane-${CSS.escape(id)}"]`);
  const box = (pane?.closest('.pane-layout-cell') ?? pane)?.getBoundingClientRect();
  return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : { x: 0, y: index * 500, width: 800, height: 500 };
}

function boundingBox(boxes: readonly ExportBox[]): ExportBox {
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(1, ...boxes.map(box => box.x + box.width - x)), height: Math.max(1, ...boxes.map(box => box.y + box.height - y)) };
}

const checkAbort = (signal: AbortSignal) => signal.throwIfAborted();

export function useDocumentExport(renderPane: RenderExportPane) {
  const { panes, activePaneId, tracePaneMap, paneXZooms } = usePaneState();
  const { allTraces, vis } = useTraceState();
  const { markers } = useMarkerState();
  const { paneViews } = useRefLineState();
  const { theme: appTheme } = useUiState();
  const layoutPreset = useOptionalAggregateWorkspace()?.state.layout.preset ?? 'rows';
  // Only one offscreen pane renders at a time. Stale previews exit before taking the renderer.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const render = (ids: readonly string[], format: ExportFormat, options: ExportDocumentOptions, now: Date, signal: AbortSignal): Promise<ExportPreview> => {
    const task = queue.current.then(async (): Promise<ExportPreview> => {
      checkAbort(signal);
      const selected = panes.filter(pane => ids.includes(pane.id));
      if (!selected.length) throw new Error('Select a pane to export.');
      const entries = selected.map((pane, index) => {
        const type = paneTypeOfMode(pane.renderMode);
        const traces = allTraces.filter(trace => (tracePaneMap[trace.name] ?? []).includes(pane.id) && (format === 'csv' && options.csvTraces === 'all' || vis[trace.name] !== false));
        const traceNames = new Set(traces.map(trace => trace.name));
        const selectedMarkers = markers.flatMap((marker, index) => traceNames.has(marker.trace)
          ? [{ trace: marker.trace, x: marker.freq, y: marker.amp, name: `${marker.type === 'delta' ? 'DM' : 'M'}${index + 1}` }] : []);
        return { pane, type, traces, selectedMarkers, box: paneBox(pane.id, index) };
      });
      if (!entries.some(entry => entry.traces.length > 0)) throw new Error('The selected panes have no traces to export.');

      if (format === 'csv') {
        const data = entries.map(({ pane, type, traces, selectedMarkers }) => {
          const linked = linkedPeers(panes, pane.id).find(id => panes.find(item => item.id === id)?.renderMode === 'cartesian');
          const local = paneXZooms[pane.id];
          const peer = linked ? paneXZooms[linked] : null;
          const manual = !linked && type === 'smith' ? pane.settings.smith.range : null;
          const zoom = local || peer;
          const range = options.csvRange === 'full' ? null : paneViews[pane.id]?.x ?? (zoom
            ? [zoom.left, zoom.right] as const : manual ? [manual.startHz, manual.stopHz] as const : null);
          return { name: paneName(panes, pane.id), traces, range, markers: options.csvMarkers ? selectedMarkers : [] };
        });
        return { kind: 'text', text: documentCsv(data, 24), makeCsv: () => documentCsv(data) };
      }

      const pdf = format === 'pdf';
      const paper = options.preset === 'ieee-1' || options.preset === 'ieee-2';
      const latex = format === 'latex';
      const appearance = pdf || latex ? { ...options, paperFont: 'serif' as const } : options;
      const theme = paper || pdf ? 'print' : resolveExportTheme(options.theme ?? readAppPreferences().exportTheme, appTheme);
      const image: ExportImageOptions = { size: options.preset === 'ieee-1' || options.preset === 'ieee-2' ? options.preset : 'pane', dpi: options.dpi, theme: theme === 'print' ? 'print' : options.theme };
      const bounds = boundingBox(entries.map(entry => entry.box));
      const geometry = documentGeometry(options, bounds);

      const title = (options.figureTitle ?? !paper) ? options.title.trim() || (selected.length === 1 ? paneName(panes, selected[0]!.id) : 'Mergen Scope') : '';
      const date = options.include.date ? new Intl.DateTimeFormat('sv-SE').format(now) : '';
      const markerRows = options.include.markerTable ? entries.flatMap(entry => entry.selectedMarkers.map(marker => {
        const trace = entry.traces.find(item => item.name === marker.trace);
        return `${marker.name}   ${Number(marker.x.toPrecision(6))} ${trace?.units.x ?? ''}   ${Number(marker.y.toPrecision(6))} ${trace?.units.y ?? ''}   ${trace ? exportTraceName(trace) : ''}`;
      })) : [];
      const layout = sheetLayout(appearance, geometry, markerRows, title, date);
      const drawings = [];
      const axes: Record<string, ExportPlotInfo> = {};
      const documents: (LatexDocument | null)[] = [];
      let markerOverflow = false;
      const group = latex && entries.length > 1;
      const mapping = exportGroupLayout(layoutPreset, entries.length);
      const settings = { ...appearance, include: { ...appearance.include, title: !!title }, title, latex: group ? { ...appearance.latex, wrap: 'picture' as const } : appearance.latex };
      for (const [index, entry] of entries.entries()) {
        checkAbort(signal);
        const box = {
          x: Math.round((entry.box.x - bounds.x) * geometry.cssWidth / bounds.width),
          y: layout.header + Math.round((entry.box.y - bounds.y) * layout.plotHeight / bounds.height),
          width: Math.max(1, Math.round(entry.box.width * geometry.cssWidth / bounds.width)), height: Math.max(1, Math.round(entry.box.height * layout.plotHeight / bounds.height)),
        };
        const columnWidth = mapping.separateMain ? 0.44 : (0.95 - (mapping.columns - 1) * 0.1) / mapping.columns;
        const panelHeight = mapping.separateMain && index === 0 ? 0.58 : Math.max(0.27, Math.min(0.57, geometry.cssHeight / geometry.cssWidth / mapping.rows));
        const drawing = entry.traces.length && (!latex || entry.type === 'chart') ? await renderPane(
          entry.pane.id, image, latex ? 'latex' : 'svg', settings,
          { ...geometry, cssWidth: box.width, cssHeight: box.height, pixelWidth: box.width, pixelHeight: box.height },
          pdf, group ? { width: columnWidth, height: panelHeight } : latex ? { width: 1, height: geometry.cssHeight / geometry.cssWidth } : undefined,
        ) : null;
        drawings.push({ box, svg: drawing?.fileSvg ?? null });
        if (drawing?.axes) axes[entry.pane.id] = drawing.axes;
        markerOverflow ||= !!drawing?.markerOverflow;
        documents.push(drawing?.latex ?? null);
      }
      checkAbort(signal);
      const probe = document.createElement('div');
      probe.className = exportThemeClass(theme);
      for (const [property, value] of Object.entries(exportTokens(theme, paper, appearance))) probe.style.setProperty(property, value);
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const palette = { background: style.getPropertyValue('--bg').trim(), ink: style.getPropertyValue('--text').trim(), border: style.getPropertyValue('--border').trim() };
      probe.remove();
      const svg = await composeSheet({ geometry, layout, panes: drawings, ...palette, embedFonts: !pdf });
      const figure = { svg, geometry, axes, markerOverflow };
      if (latex) {
        const first = documents.find(document => document !== null);
        if (!first) throw new Error('Select a chart pane with traces to export as TikZ.');
        const output = group ? latexPaneLayout(documents, appearance.latex, title, layoutPreset) : first;
        return { kind: 'text', text: latexMarkerTable(output, appearance.latex, markerRows), files: output.files, figure };
      }
      return { kind: 'image', ...figure };
    });
    queue.current = task.then(() => {}, () => {});
    return task;
  };
  return { panes, activePaneId, allTraces, tracePaneMap, vis, render };
}

export async function exportDocumentBlob(preview: ExportPreview, format: ExportFormat, options: ExportDocumentOptions, name: string): Promise<Blob> {
  if (preview.kind === 'text') {
    if (format === 'csv') return new Blob([preview.makeCsv?.() ?? preview.text], { type: 'text/csv;charset=utf-8' });
    if (options.latex.data === 'zip') return exportZip([{ name: name.replace(/\.zip$/i, '.tex'), text: preview.text }, ...preview.files ?? []]);
    return new Blob([preview.text], { type: 'application/x-tex;charset=utf-8' });
  }
  if (format === 'pdf') {
    if (options.preset !== 'ieee-1' && options.preset !== 'ieee-2') throw new Error('Choose an IEEE paper size for PDF.');
    const { paperPdf } = await import('./export-pdf');
    return paperPdf(preview.svg, options.preset);
  }
  if (format === 'svg') return new Blob([preview.svg], { type: 'image/svg+xml;charset=utf-8' });
  return svgToPng(preview.svg, preview.geometry.pixelWidth, preview.geometry.pixelHeight);
}
