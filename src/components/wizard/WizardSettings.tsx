import { useId, useState } from 'react';
import type { WizardConfig } from '../../types/file';
import type { TraceDomain } from '../../types/trace';
import { MessageBar, Segmented } from '../shared/Controls';
import { X_UNITS, Y_UNITS, unitLabel } from '../../domain/import-units';
import type { ImportUnit } from '../../domain/import-units';
import { hasCustomMultiplier, setDomain, setXUnit, setYUnit } from '../../domain/import-wizard';
import type { WizardDelimiter } from '../../domain/parsers/tabular-detect';

const DELIMITERS: readonly { value: WizardDelimiter; label: string; ariaLabel: string }[] = [
  { value: ',', label: ',', ariaLabel: 'Comma' },
  { value: ';', label: ';', ariaLabel: 'Semicolon' },
  { value: '\t', label: 'Tab', ariaLabel: 'Tab' },
];
const DOMAINS: readonly { value: TraceDomain; label: string }[] = [
  { value: 'frequency', label: 'Frequency' },
  { value: 'time', label: 'Time' },
];
const CUSTOM = '__custom';
const FROM_HEADER = '__header';

export interface WizardSettingsProps {
  config: WizardConfig;
  maxSkipRows: number;
  detected: { domain: TraceDomain; confidence: 'high' | 'low' };
  onChange: (next: WizardConfig) => void;
  onLayout: (delimiter: string, skipRows: number) => void;
}

export function WizardSettings({ config, maxSkipRows, detected, onChange, onLayout }: WizardSettingsProps) {
  const skipId = useId();
  const delimiter = DELIMITERS.some(item => item.value === config.delimiter) ? (config.delimiter as WizardDelimiter) : ',';
  const setSkip = (value: number) => onLayout(config.delimiter, Math.max(0, Math.min(maxSkipRows, Math.floor(Number.isFinite(value) ? value : 0))));
  return (
    <div className="iw-settings">
      <section className="iw-group" aria-label="Format">
        <h3 className="t-section">Format</h3>
        <div className="iw-line">
          <span className="t-label t-muted">Delimiter</span>
          <div className="iw-seg"><Segmented label="Delimiter" options={DELIMITERS} value={delimiter} onChange={value => onLayout(value, config.skipRows)} /></div>
        </div>
        <div className="iw-line">
          <label className="t-label t-muted" htmlFor={skipId}>Skip rows</label>
          <input id={skipId} className="iw-input t-label" type="number" min={0} max={maxSkipRows} step={1} value={config.skipRows} onChange={event => setSkip(Number(event.target.value))} />
        </div>
      </section>

      <section className="iw-group" aria-label="Domain">
        <h3 className="t-section">Domain</h3>
        <div className="iw-line">
          <span className="t-label t-muted">X axis</span>
          <div className="iw-seg"><Segmented label="Domain" options={DOMAINS} value={config.domain} onChange={value => onChange(setDomain(config, value))} /></div>
        </div>
        <span className="t-caption" data-testid="import-wizard-detected">Detected: {detected.domain} ({detected.confidence} confidence)</span>
        {detected.confidence === 'low' && <MessageBar status="warning">No column name says time or frequency, so this is a guess from the numbers. Check it.</MessageBar>}
      </section>

      <section className="iw-group" aria-label="Units">
        <h3 className="t-section">Units</h3>
        <UnitField
          label="X in"
          unit={config.xUnit}
          units={X_UNITS[config.domain]}
          custom={hasCustomMultiplier(config, 'x')}
          mult={config.xMult}
          onUnit={id => onChange(setXUnit(config, id))}
          onCustom={() => onChange({ ...config, xUnit: config.domain === 'time' ? 's' : 'Hz' })}
          onMult={xMult => onChange({ ...config, xMult })}
        />
        <UnitField
          label="Y in"
          unit={config.yUnit}
          units={Y_UNITS}
          custom={hasCustomMultiplier(config, 'y')}
          mult={config.yMult}
          onUnit={id => onChange(setYUnit(config, id))}
          onCustom={() => onChange({ ...config, yUnit: config.yUnit ?? '' })}
          onMult={yMult => onChange({ ...config, yMult })}
        />
        <span className="t-caption">Units replace raw ×1000 multipliers; picking "ms" sets ×0.001.</span>
      </section>
    </div>
  );
}

interface UnitFieldProps {
  label: string;
  unit: string | undefined;
  units: readonly ImportUnit[];
  custom: boolean;
  mult: number;
  onUnit: (id: string) => void;
  onCustom: () => void;
  onMult: (mult: number) => void;
}

/** A small unit menu; "custom (×N)…" opens the advanced multiplier field under it. */
function UnitField({ label, unit, units, custom: customMult, mult, onUnit, onCustom, onMult }: UnitFieldProps) {
  const id = useId();
  const multId = useId();
  const [picked, setPicked] = useState(false);
  const custom = customMult || picked;
  const known = unit !== undefined && units.some(item => item.id === unit);
  const value = custom ? CUSTOM : known ? unit : FROM_HEADER;
  return (
    <>
      <div className="iw-line">
        <label className="t-label t-muted" htmlFor={id}>{label}</label>
        <span className="iw-menu">
          <select id={id} className="t-label" value={value} onChange={event => {
            const next = event.target.value;
            setPicked(next === CUSTOM);
            if (next === CUSTOM) onCustom();
            else if (next !== FROM_HEADER) onUnit(next);
          }}>
            {value === FROM_HEADER && <option value={FROM_HEADER}>from column names</option>}
            {units.map(item => <option key={item.id} value={item.id}>{unitLabel(item)}</option>)}
            <option value={CUSTOM}>custom (×N)…</option>
          </select>
          <span className="iw-caret" aria-hidden="true">▾</span>
        </span>
      </div>
      {custom && (
        <div className="iw-line">
          <label className="t-caption" htmlFor={multId}>×</label>
          <input id={multId} className="iw-input iw-input--mult t-label" type="number" step="any" aria-label={`${label} multiplier`} value={mult} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next) && next !== 0) onMult(next); }} />
        </div>
      )}
    </>
  );
}
