import { useMemo } from 'react';
import { useTableView } from '../../../hooks/use-table-view';
import { mergeTableRows } from '../../../domain/table-rows';
import { tableXFormat, tableYFormat } from '../../../domain/table-format';
import { tableXLabel } from '../../../domain/table-view';
import { useTraceColors } from '../../../hooks/use-trace-colors';
import { useTraceSymbols } from '../../../hooks/use-trace-symbols';
import { TraceSymbol } from '../../shared/TraceSymbol';
import type { ExportView } from './export-context';

export function ExportTableSvg({ paneId, view, fontPx }: { paneId: string; view: ExportView; fontPx: number }) {
  const { traces, xGroup, settings, visible } = useTableView(paneId);
  const { width, height, colorTheme } = view;
  const color = useTraceColors(colorTheme, view.paperTone);
  const symbol = useTraceSymbols('always');
  const window = settings.range === 'visible' && visible.available ? visible.window : null;
  const sources = useMemo(() => traces.map(trace => ({ id: trace.id, xs: trace.data.map(p => p.freq), ys: trace.data.map(p => p.amp) })), [traces]);
  const rows = useMemo(() => mergeTableRows(sources, window ?? undefined), [sources, window]);
  const xFormat = tableXFormat(rows.x, xGroup);
  const yFormats = traces.map((trace, index) => tableYFormat(sources[index]?.ys ?? [], trace.units.y));
  const rowHeight = Math.ceil(fontPx * 1.65);
  const limit = Math.max(0, Math.floor(height / rowHeight) - 1);
  const more = rows.x.length > limit;
  const count = more ? Math.max(0, limit - 1) : rows.x.length;
  const colWidth = width / (traces.length + 1);
  const showLabel = (text: string, reserved = 0) => {
    const chars = Math.max(1, Math.floor((colWidth - 12 - reserved) / (fontPx * 0.58)));
    return text.length > chars ? text.slice(0, Math.max(0, chars - 1)) + '…' : text;
  };
  const xHeading = tableXLabel(traces[0]?.domain, xGroup);
  return (
    <svg data-export-table="" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <rect width={width} height={height} fill="var(--bg)" />
      <rect width={width} height={rowHeight} fill="var(--raised)" />
      <g fill="var(--text)" fontSize={fontPx} fontFamily="var(--font-sans)">
        <text x={6} y={rowHeight * 0.7}>{showLabel(xFormat.unit ? `${xHeading} (${xFormat.unit})` : xHeading)}</text>
        {traces.map((trace, index) => {
          const x = (index + 1) * colWidth + 6;
          const ink = color(trace);
          const kind = symbol(trace.id);
          const unit = yFormats[index]?.unit;
          return <g key={trace.id}>
            {kind && <g transform={`translate(${x + 5} ${rowHeight / 2}) scale(0.65)`}><TraceSymbol kind={kind} color={ink} hollow /></g>}
            <text x={x + 14} y={rowHeight * 0.7}>{showLabel(`${trace.dn || trace.name}${unit ? ` (${unit})` : ''}`, 14)}</text>
          </g>;
        })}
      </g>
      {rows.x.slice(0, count).map((value, index) => {
        const y = rowHeight * (index + 1);
        return <g key={index} fill="var(--text)" fontSize={fontPx} fontFamily="var(--font-mono)" textAnchor="end">
          <line x1={0} x2={width} y1={y} y2={y} stroke="var(--border)" />
          <text x={colWidth - 6} y={y + rowHeight * 0.7}>{xFormat.format(value)}</text>
          {rows.cells[index]?.map((sample, column) => <text key={column} x={(column + 2) * colWidth - 6} y={y + rowHeight * 0.7}>{sample === null ? '–' : yFormats[column]?.format(sample)}</text>)}
        </g>;
      })}
      {more && <text x={6} y={rowHeight * (count + 1.7)} fill="var(--text-muted)" fontSize={fontPx} fontFamily="var(--font-sans)">{rows.x.length - count} more rows</text>}
    </svg>
  );
}
