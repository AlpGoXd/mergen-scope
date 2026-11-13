import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { arrange, flattenLayoutSizes, normalizeSizes, xTickVisibility } from '../../domain/pane-layout';
import { traceXGroup } from '../../domain/pane-placement';
import type { Divider, LayoutSizes, PresetId } from '../../domain/pane-layout';
import { VisibleRefLinesProvider } from '../../stores/ref-line-store';
import { traceView, useAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { ChartPane } from './ChartPane';
import { LayoutDivider } from './LayoutDivider';
import './pane-layout.css';

function readSizes(preset: PresetId, count: number, saved: Readonly<Record<string, number>>): LayoutSizes {
  const values = (prefix: string) => Object.entries(saved).filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length))).map(([, value]) => value);
  if (preset === 'grid') return normalizeSizes(preset, count, { kind: 'grid', cols: values('grid:c'), rows: values('grid:r') });
  if (preset === 'one-side') return normalizeSizes(preset, count, { kind: 'one-side', main: saved['side:main'] ?? 0.5, stack: values('side:s') });
  return normalizeSizes(preset, count, { kind: preset, tracks: values(`${preset}:`) });
}
const tracks = (weights: number[], minimum: number) => weights.map(weight => `minmax(${minimum}px, ${weight}fr)`).join(' 8px ');

export function PaneLayoutGrid({ paneIds }: { paneIds: string[] }) {
  const { state, dispatch } = useAggregateWorkspace();
  const preset = state.layout.preset;
  const visibility = useMemo(() => {
  const traces = traceView(state.files, state.traces).allTraces;
  return xTickVisibility(preset, state.panes.panes.map(({ id }) => {
    const pane = state.panes.panes.find(item => item.id === id);
    const members = traces.filter(trace => (state.panes.tracePaneMap[trace.name] ?? []).includes(id) && state.traces.vis[trace.name]);
    const unit = members[0] ? traceXGroup(members[0]) : null;
    let min = Infinity, max = -Infinity;
    for (const trace of members) for (const point of trace.data) { if (Number.isFinite(point.freq)) { min = Math.min(min, point.freq); max = Math.max(max, point.freq); } }
    return { xUnit: pane?.renderMode === 'cartesian' && unit && members.every(trace => traceXGroup(trace) === unit) ? unit : null, xExtent: Number.isFinite(min) && Number.isFinite(max) && max > min ? [min, max] as const : null };
  }), state.panes.zoomAll, state.panes.sharedZoom !== null);
  }, [preset, state.files, state.traces, state.panes]);
  const arrangement = arrange(preset, paneIds.length);
  const saved = readSizes(preset, paneIds.length, state.layout.sizes);
  const [live, setLive] = useState<LayoutSizes | null>(null);
  const [dragged, setDragged] = useState<Divider | null>(null);
  const sizes = live?.kind === preset ? live : saved;
  const gridRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = gridRef.current; if (!element) return;
    const observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) setBox({ width: rect.width, height: rect.height }); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => { setLive(null); }, [preset, paneIds.length]);
  let cols: number[] = [1], rows: number[] = [1];
  if (sizes.kind === 'grid') { cols = sizes.cols; rows = sizes.rows; }
  else if (sizes.kind === 'one-side') { cols = [sizes.main, 1 - sizes.main]; rows = sizes.stack; }
  else if (sizes.kind === 'rows') rows = sizes.tracks;
  else cols = sizes.tracks;
  const commit = (next: LayoutSizes) => { setLive(null); dispatch({ slice: 'layout', action: { type: 'SET_LAYOUT_SIZES', sizes: flattenLayoutSizes(next) } }); };
  const cellStyle = (index: number): CSSProperties => {
    if (preset === 'rows') return { gridRow: 2 * index + 1, gridColumn: 1 };
    if (preset === 'columns') return { gridColumn: 2 * index + 1, gridRow: 1 };
    if (preset === 'grid') return { gridColumn: 2 * (index % 2) + 1, gridRow: 2 * Math.floor(index / 2) + 1 };
    return index === 0 ? { gridColumn: 1, gridRow: `1 / ${rows.length * 2}` } : { gridColumn: 3, gridRow: 2 * index - 1 };
  };
  // While a divider is dragged, panes that do not touch it are dimmed very slightly.
  const touches = (index: number, divider: Divider): boolean => {
    const column = preset === 'columns' ? index : preset === 'grid' ? index % 2 : preset === 'one-side' ? (index === 0 ? 0 : 1) : 0;
    const row = preset === 'rows' ? index : preset === 'grid' ? Math.floor(index / 2) : preset === 'one-side' ? index - 1 : 0;
    if (divider.orientation === 'vertical') return divider.tracks.includes(column);
    return divider.tracks.includes(row) && !(preset === 'one-side' && index === 0);
  };
  return <div className="pane-layout-scroll"><div ref={gridRef} className="pane-layout-grid" style={{ gridTemplateColumns: tracks(cols, 160), gridTemplateRows: tracks(rows, 120), minWidth: cols.length * 160 + Math.max(0, cols.length - 1) * 8, minHeight: rows.length * 120 + Math.max(0, rows.length - 1) * 8 }}>
    {paneIds.map((id, index) => <div key={id} className={`pane-layout-cell${dragged && !touches(index, dragged) ? ' is-dimmed' : ''}`} style={cellStyle(index)}><VisibleRefLinesProvider><ChartPane paneId={id} hideXTicks={visibility[index] === false} /></VisibleRefLinesProvider></div>)}
    {arrangement.dividers.map(divider => {
      const vertical = divider.orientation === 'vertical';
      const index = divider.tracks[0];
      const style: CSSProperties = vertical ? { gridColumn: 2 * index + 2, gridRow: `1 / ${rows.length * 2}` } : { gridRow: 2 * index + 2, gridColumn: preset === 'one-side' ? 3 : `1 / ${cols.length * 2}` };
      const pixels = vertical ? box.width - (cols.length - 1) * 8 : box.height - (rows.length - 1) * 8;
      return <LayoutDivider key={divider.key} divider={divider} sizes={sizes} count={paneIds.length} pixels={pixels} style={style} onLive={setLive} onCancel={() => setLive(null)} onCommit={commit} onActive={active => setDragged(current => active ? divider : current?.key === divider.key ? null : current)} />;
    })}
  </div></div>;
}
