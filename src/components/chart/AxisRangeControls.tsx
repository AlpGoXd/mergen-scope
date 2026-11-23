import {
  applyAxisMax,
  applyAxisMin,
  applyAxisPerDiv,
  formatAxisBound,
} from '../../domain/chart/axis-range';
import type { AxisRange } from '../../domain/chart/axis-range';
import type { AxisScale } from '../../types/pane';
import { Btn } from '../shared/Btn';
import { EditableValue } from '../shared/EditableValue';
import './pane-chrome.css';

export interface AxisControlSpec {
  readonly domain: AxisRange | null;
  readonly scale: AxisScale;
  readonly unit: string | null;
  readonly perDiv: string;
  readonly onSetRange: (range: AxisRange) => void;
  readonly onFit: () => void;
}

function SingleAxisRange({
  axis,
  spec,
  showFit,
}: {
  axis: 'x' | 'y';
  spec: AxisControlSpec;
  showFit: boolean;
}) {
  const upper = axis.toUpperCase();
  const domain = spec.domain;
  const minText = domain ? formatAxisBound(domain.min, spec.unit) : '—';
  const maxText = domain ? formatAxisBound(domain.max, spec.unit) : '—';

  const commitMin = (text: string) => {
    if (!domain) return 'No axis range';
    const result = applyAxisMin(domain, text, spec.scale, spec.unit);
    if (!result.ok) return result.reason;
    spec.onSetRange(result.range);
    return null;
  };

  const commitMax = (text: string) => {
    if (!domain) return 'No axis range';
    const result = applyAxisMax(domain, text, spec.scale, spec.unit);
    if (!result.ok) return result.reason;
    spec.onSetRange(result.range);
    return null;
  };

  const commitDiv = (text: string) => {
    if (!domain) return 'No axis range';
    const result = applyAxisPerDiv(domain, text, spec.scale, spec.unit);
    if (!result.ok) return result.reason;
    spec.onSetRange(result.range);
    return null;
  };

  return (
    <div className="axis-range-group" data-testid={`axis-range-${axis}`}>
      <div className="axis-range-row">
        <span className="axis-range-label t-label">{upper} range</span>
        <div className="axis-range-fields">
          <EditableValue
            value={minText}
            label={`${upper} min`}
            disabled={!domain}
            onCommit={commitMin}
            testId={`axis-${axis}-min`}
          />
          <span className="axis-range-arrow t-caption" aria-hidden="true">→</span>
          <EditableValue
            value={maxText}
            label={`${upper} max`}
            disabled={!domain}
            onCommit={commitMax}
            testId={`axis-${axis}-max`}
          />
          {showFit && <Btn small onClick={spec.onFit}>Fit {upper}</Btn>}
        </div>
      </div>
      <div className="axis-range-row">
        <span className="axis-range-label t-label">{upper} / div</span>
        <div className="axis-range-fields">
          {spec.scale === 'log' ? (
            <span className="t-readout pset-scale">Log</span>
          ) : (
            <EditableValue
              value={spec.perDiv}
              label={`${upper} per division`}
              disabled={!domain || spec.perDiv === '—'}
              onCommit={commitDiv}
              testId={`axis-${axis}-div`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Editable X/Y min, max, and per-division controls shared by the pane header
 * scale popover, Pane settings → Axes, and the axis-tick popover.
 */
export function AxisRangeControls({
  x,
  y,
  axis = 'both',
  showFit = true,
}: {
  x: AxisControlSpec;
  y: AxisControlSpec;
  axis?: 'x' | 'y' | 'both';
  showFit?: boolean;
}) {
  return (
    <div className="axis-range-stack">
      {(axis === 'both' || axis === 'x') && <SingleAxisRange axis="x" spec={x} showFit={showFit} />}
      {(axis === 'both' || axis === 'y') && <SingleAxisRange axis="y" spec={y} showFit={showFit} />}
    </div>
  );
}
