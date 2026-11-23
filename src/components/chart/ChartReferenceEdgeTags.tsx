import { formatCrossingValue } from '../../domain/analysis/crossing-rows';
import type { RefLine } from '../../types/ref-line';
import type { Trace } from '../../types/trace';
import type { AxisInfo } from '../../types/units';
import { EdgeTag } from '../lines/Lines';
import type { PlotView } from './LinesLayer';

interface ChartReferenceEdgeTagsProps {
  paneRefLines: readonly RefLine[];
  plotView: PlotView;
  activePaneTrace: Trace | null;
  yUnit: AxisInfo['yUnit'];
  litId: number | null;
  onReveal: (line: RefLine, range: readonly [number, number]) => void;
  onHover: (lineId: number | null) => void;
}

export function ChartReferenceEdgeTags({
  paneRefLines, plotView, activePaneTrace, yUnit, litId, onReveal, onHover,
}: ChartReferenceEdgeTagsProps) {
  return paneRefLines.flatMap((line) => {
    const range = line.type === 'v' ? plotView.x : plotView.y;
    if (!range || (line.value >= range[0] && line.value <= range[1])) return [];
    const side = line.type === 'v' ? (line.value > range[1] ? 'right' : 'left') : (line.value > range[1] ? 'top' : 'bottom');
    const offset = line.type === 'v' ? plotView.plot.top + plotView.plot.height / 2 : plotView.plot.left + plotView.plot.width / 2;
    const unit = line.type === 'v' ? (activePaneTrace?.units.x ?? (activePaneTrace?.domain === 'time' ? 's' : 'Hz')) : yUnit;
    const value = formatCrossingValue(line.value, unit, Math.abs(line.value) > 0 ? 10 ** (Math.floor(Math.log10(Math.abs(line.value))) - 5) : 0);
    return [<EdgeTag key={`edge-${line.id}`} side={side} offset={offset} label={line.label ?? (line.type === 'v' ? 'V' : 'H')} value={value}
      lit={litId === line.id} onReveal={() => onReveal(line, range)}
      onHover={(hovering) => onHover(hovering ? line.id : null)} />];
  });
}
