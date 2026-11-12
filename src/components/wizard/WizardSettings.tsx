import { useId, useState } from 'react';
import type { WizardConfig } from '../../types/file';
import type { TraceDomain } from '../../types/trace';
import { Btn } from '../shared/Btn';
import { MessageBar, Segmented, Select } from '../shared/Controls';
import { X_UNITS, Y_UNITS } from '../../domain/import-units';
import { hasCustomMultiplier, setDomain, setXUnit, setYUnit } from '../../domain/import-wizard';
import type { WizardDelimiter } from '../../domain/parsers/tabular-detect';

const DELIMITERS: readonly { value: WizardDelimiter; label: string }[] = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
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
        <div className="iw-field">
          <span className="t-label">Delimiter</span>
          <Segmented label="Delimiter" options={DELIMITERS} value={delimiter} onChange={value => onLayout(value, config.skipRows)} />
        </div>
        <div className="iw-field">
          <label className="t-label" htmlFor={skipId}>Skip rows</label>
          <div className="iw-stepper">
            <Btn small aria-label="Skip one row fewer" disabled={config.skipRows <= 0} onClick={() => setSkip(config.skipRows - 1)}>−</Btn>
            <input id={skipId} className="iw-input" type="number" min={0} max={maxSkipRows} step={1} value={config.skipRows} onChange={event => setSkip(Number(event.target.value))} />
            <Btn small aria-label="Skip one more row" disabled={config.skipRows >= maxSkipRows} onClick={() => setSkip(config.skipRows + 1)}>+</Btn>
          </div>
          <span className="t-caption">{config.skipRows > 0 ? `Row ${config.skipRows} gives the column names.` : 'Columns are numbered.'}</span>
        </div>
      </section>

      <section className="iw-group" aria-label="Domain">
        <h3 className="t-section">Domain</h3>
        <Segmented label="Domain" options={DOMAINS} value={config.domain} onChange={value => onChange(setDomain(config, value))} />
        <span className="t-caption" data-testid="import-wizard-detected">Detected: {detected.domain} ({detected.confidence} confidence)</span>
        {detected.confidence === 'low' && <MessageBar status="warning">No column name says time or frequency, so this is a guess from the numbers. Check it.</MessageBar>}
      </section>

      <section className="iw-group" aria-label="Units">
        <h3 className="t-section">Units</h3>
        <UnitField
          label="X in"
          unit={config.xUnit}
          units={X_UNITS[config.domain].map(unit => ({ value: unit.id, label: unit.id }))}
          custom={hasCustomMultiplier(config, 'x')}
          mult={config.xMult}
          onUnit={id => onChange(setXUnit(config, id))}
          onCustom={() => onChange({ ...config, xUnit: config.domain === 'time' ? 's' : 'Hz' })}
          onMult={xMult => onChange({ ...config, xMult })}
        />
        <UnitField
          label="Y in"
          unit={config.yUnit}
          units={Y_UNITS.map(unit => ({ value: unit.id, label: unit.id || 'No unit' }))}
          custom={hasCustomMultiplier(config, 'y')}
          mult={config.yMult}
          onUnit={id => onChange(setYUnit(config, id))}
          onCustom={() => onChange({ ...config, yUnit: config.yUnit ?? '' })}
          onMult={yMult => onChange({ ...config, yMult })}
        />
      </section>
    </div>
  );
}

interface UnitFieldProps {
  label: string;
  unit: string | undefined;
  units: readonly { value: string; label: string }[];
  custom: boolean;
  mult: number;
  onUnit: (id: string) => void;
  onCustom: () => void;
  onMult: (mult: number) => void;
}

/** A unit menu; "Custom ×N…" opens the advanced multiplier field under it. */
function UnitField({ label, unit, units, custom: customMult, mult, onUnit, onCustom, onMult }: UnitFieldProps) {
  const id = useId();
  const [picked, setPicked] = useState(false);
  const custom = customMult || picked;
  const multId = useId();
  const known = unit !== undefined && units.some(item => item.value === unit);
  const value = custom ? CUSTOM : known ? unit : FROM_HEADER;
  return (
    <div className="iw-field">
      <label className="t-label" htmlFor={id}>{label}</label>
      <Select id={id} value={value} onChange={event => {
        const next = event.target.value;
        setPicked(next === CUSTOM);
        if (next === CUSTOM) onCustom();
        else if (next !== FROM_HEADER) onUnit(next);
      }}>
        {value === FROM_HEADER && <option value={FROM_HEADER}>From column names</option>}
        {units.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        <option value={CUSTOM}>Custom ×N…</option>
      </Select>
      {custom && (
        <div className="iw-row">
          <label className="t-caption" htmlFor={multId}>Multiply values by ×</label>
          <input id={multId} className="iw-input iw-input--mult" type="number" step="any" value={mult} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next) && next !== 0) onMult(next); }} />
        </div>
      )}
    </div>
  );
}
