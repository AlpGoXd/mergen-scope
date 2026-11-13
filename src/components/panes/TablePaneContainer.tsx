import { useEffect, useMemo, useState } from 'react';
import { usePaneDispatch } from '../../stores/pane-store';
import { useMarkerDispatch, useMarkerState } from '../../stores/marker-store';
import { useRefLineDispatch } from '../../stores/ref-line-store';
import { useSharedHover } from '../../stores/shared-hover-store';
import { useUiState } from '../../stores/ui-store';
import { useTraceState } from '../../stores/trace-store';
import { useTraceColors } from '../../hooks/use-trace-colors';
import { useTraceSymbols } from '../../hooks/use-trace-symbols';
import { useTableView } from '../../hooks/use-table-view';
import { mergeTableRows } from '../../domain/table-rows';
import { tableMarks } from '../../domain/table-markers';
import { tableXFormat, tableYFormat } from '../../domain/table-format';
import { tableXLabel } from '../../domain/table-view';
import { xUnitGroup } from '../../domain/pane-placement';
import { allocateTraceColors, traceWidth } from '../../domain/trace-palette';
import { TraceSymbol } from '../shared/TraceSymbol';
import { Btn } from '../shared/Btn';
import { PaneTypeIcon } from './pane-type-icons';
import { TablePane } from './TablePane';
import type { TableColumn } from './TablePane';
import './pane-table.css';

/** Table pane owner: picks the traces, merges their rows, tracks the shared cursor and formats numbers. */
export function TablePaneContainer({ paneId }: { paneId: string; fitRequest?: number }) {
  const view = useTableView(paneId);
  const { traces, xGroup, settings, visible } = view;
  const { allKnownTraces } = useTraceState();
  const { traceHueSlots } = useUiState();
  const color = useTraceColors();
  const symbol = useTraceSymbols();
  const paneDispatch = usePaneDispatch();
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const lineDispatch = useRefLineDispatch();
  const assignments = useMemo(() => allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))), [allKnownTraces, traceHueSlots]);

  // Shared cursor: the crosshair X of any other pane with the same X unit. It stays when the pointer leaves.
  const hover = useSharedHover();
  const [cursorX, setCursorX] = useState<number | null>(null);
  useEffect(() => { setCursorX(null); }, [xGroup]);
  useEffect(() => {
    if (hover && hover.paneId !== paneId && xGroup && xUnitGroup(hover.xUnit) === xGroup) setCursorX(hover.value);
  }, [hover, paneId, xGroup]);

  const visibleWindow = settings.range === 'visible' && visible.available ? visible.window : null;
  const sources = useMemo(() => traces.map(trace => ({ id: trace.id, xs: trace.data.map(point => point.freq), ys: trace.data.map(point => point.amp) })), [traces]);
  const rows = useMemo(() => mergeTableRows(sources, visibleWindow ?? undefined), [sources, visibleWindow?.min, visibleWindow?.max]);
  const xFormat = useMemo(() => tableXFormat(rows.x, xGroup), [rows.x, xGroup]);
  // `symbol` is a new closure on every render; this key changes only when a trace's symbol does.
  const symbolKey = traces.map(trace => symbol(trace.id) ?? '').join(',');
  const columns = useMemo(() => traces.map((trace, k): TableColumn & { format: (y: number) => string } => {
    const fmt = tableYFormat(sources[k]?.ys ?? [], trace.units.y);
    const traceColor = color(trace);
    const kind = symbol(trace.id);
    const assignment = assignments.get(trace.id);
    return {
      id: trace.id, label: trace.dn || trace.name, unit: fmt.unit || undefined, color: traceColor, format: fmt.format,
      sample: kind === null ? undefined : (
        <svg width="16" height="12" viewBox="-8 -6 16 12" style={{ overflow: 'visible', flex: 'none' }} aria-hidden="true">
          <line x1="-8" y1="0" x2="8" y2="0" stroke={traceColor} strokeWidth={assignment ? traceWidth(assignment) : 1.5} />
          <TraceSymbol kind={kind} color={traceColor} background="var(--panel)" />
        </svg>
      ),
    };
  }), [traces, sources, color, symbolKey, assignments]);
  const formats = useMemo(() => new Map(columns.map(column => [column.id, column.format])), [columns]);
  const marks = useMemo(() => tableMarks(markers, traces.map(trace => trace.name), rows.x), [markers, traces, rows.x]);
  const selectedMarkerId = markers[selectedMkrIdx]?.id ?? null;
  const selectMarker = (id: string) => {
    lineDispatch({ type: 'SET_SELECTED', payload: null });
    markerDispatch({ type: 'SET_SELECTED_IDX', payload: markers.findIndex(marker => marker.id === id) });
  };
  // Same rules as a chart click: a delta marker goes only on its reference marker's trace.
  const placeAt = (row: number, column: number) => {
    const trace = traces[column];
    const x = rows.x[row];
    if (!armed || !trace || x === undefined) return;
    if (armed.kind === 'delta' && markers.find(marker => marker.id === armed.refId)?.trace !== trace.name) return;
    lineDispatch({ type: 'SET_SELECTED', payload: null });
    markerDispatch({ type: 'PLACE_MARKER', payload: { trace, targetFreq: x, markerType: armed.kind, refId: armed.kind === 'delta' ? armed.refId : null } });
  };

  if (traces.length === 0) {
    const addTraces = () => {
      paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
      if (allKnownTraces.length === 0) document.querySelector<HTMLInputElement>('[data-testid="app-open-input"]')?.click();
      else document.querySelector<HTMLElement>('[data-testid^="trace-row-"]')?.scrollIntoView({ block: 'nearest' });
    };
    return (
      <div className="tbp-empty" data-testid={`table-empty-${paneId}`}>
        <PaneTypeIcon name="table" size={28} />
        <div className="t-card-title">Empty table</div>
        <p className="t-label">Show traces here from the Traces list (Show in › this pane), or drop a file.</p>
        <div className="tbp-empty__actions">
          <Btn small onClick={addTraces}>Add traces…</Btn>
        </div>
      </div>
    );
  }

  const first = traces[0];
  return (
    <div data-testid={`table-pane-${paneId}`} style={{ position: 'absolute', inset: 0 }}>
      <TablePane xLabel={tableXLabel(first?.domain, xGroup)} xUnit={xFormat.unit} columns={columns} rows={rows} cursorX={cursorX}
        formatX={xFormat.format} formatY={(y, column) => formats.get(column.id)?.(y) ?? String(y)}
        marks={marks} selectedMarkerId={selectedMarkerId} onMarkClick={selectMarker} placing={armed !== null} onPlace={placeAt}
        status={settings.range === 'visible' && visible.available ? 'Visible range' : undefined} />
    </div>
  );
}
