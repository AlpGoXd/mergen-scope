import { useEffect, useId, useState } from 'react';
import type { WizardConfig, WizardNetworkConfig } from '../../types/file';
import { Btn } from '../shared/Btn';
import { Icon, MessageBar, PopoverAt, Segmented } from '../shared/Controls';
import { CaretDownIcon } from '../shared/Icons';
import { findXUnit, findYUnit } from '../../domain/import-units';
import { hasCustomMultiplier, setXUnit, setYUnit } from '../../domain/import-wizard';
import { detectSParameterNetwork } from '../../domain/parsers/tabular-detect';
import type { ConfidenceLevel, WizardDelimiter } from '../../domain/parsers/tabular-detect';

const DELIMITERS: readonly { value: WizardDelimiter; label: string; ariaLabel: string }[] = [
  { value: ',', label: ',', ariaLabel: 'Comma' },
  { value: ';', label: ';', ariaLabel: 'Semicolon' },
  { value: '\t', label: 'Tab', ariaLabel: 'Tab' },
  { value: ' ', label: 'Space', ariaLabel: 'Whitespace' },
];

type PrimaryXGroup = 'frequency' | 'time' | 'angle';
type ExtraXGroup = 'voltage' | 'current' | 'power' | 'db' | 'impedance';

const X_PRIMARY_GROUPS: readonly { value: PrimaryXGroup; label: string; ariaLabel: string; defaultUnit: string }[] = [
  { value: 'frequency', label: 'Freq', ariaLabel: 'Frequency', defaultUnit: 'Hz' },
  { value: 'time', label: 'Time', ariaLabel: 'Time', defaultUnit: 's' },
  { value: 'angle', label: 'Angle', ariaLabel: 'Angle', defaultUnit: '°' },
];

/** Extra X quantities in the More popover — each picks a quantity; its scale strip appears below without duplicates. */
const X_MORE_QUANTITIES: readonly { id: ExtraXGroup; label: string; face: string; defaultUnit: string; units: readonly string[] }[] = [
  { id: 'voltage', label: 'Voltage', face: 'Volt', defaultUnit: 'V', units: ['V', 'mV'] },
  { id: 'current', label: 'Current', face: 'Curr', defaultUnit: 'A', units: ['A', 'mA'] },
  { id: 'power', label: 'Power', face: 'Power', defaultUnit: 'dBm', units: ['W', 'mW', 'dBm'] },
  { id: 'db', label: 'dB', face: 'dB', defaultUnit: 'dB', units: ['dB'] },
  { id: 'impedance', label: 'Impedance (Ω)', face: 'Ω', defaultUnit: 'Ohm', units: ['Ohm'] },
];

const X_SCALE_ROWS: Readonly<Record<string, readonly { value: string; label: string; ariaLabel: string }[]>> = {
  frequency: [
    { value: 'Hz', label: 'Hz', ariaLabel: 'hertz (Hz)' },
    { value: 'kHz', label: 'kHz', ariaLabel: 'kilohertz (kHz)' },
    { value: 'MHz', label: 'MHz', ariaLabel: 'megahertz (MHz)' },
    { value: 'GHz', label: 'GHz', ariaLabel: 'gigahertz (GHz)' },
    { value: 'THz', label: 'THz', ariaLabel: 'terahertz (THz)' },
  ],
  time: [
    { value: 's', label: 's', ariaLabel: 'seconds (s)' },
    { value: 'ms', label: 'ms', ariaLabel: 'milliseconds (ms)' },
    { value: 'µs', label: 'µs', ariaLabel: 'microseconds (µs)' },
    { value: 'ns', label: 'ns', ariaLabel: 'nanoseconds (ns)' },
    { value: 'ps', label: 'ps', ariaLabel: 'picoseconds (ps)' },
  ],
  angle: [
    { value: '°', label: '°', ariaLabel: 'degrees (°)' },
    { value: 'rad', label: 'rad', ariaLabel: 'radians (rad)' },
  ],
  voltage: [
    { value: 'V', label: 'V', ariaLabel: 'volts (V)' },
    { value: 'mV', label: 'mV', ariaLabel: 'millivolts (mV)' },
  ],
  current: [
    { value: 'A', label: 'A', ariaLabel: 'amperes (A)' },
    { value: 'mA', label: 'mA', ariaLabel: 'milliamperes (mA)' },
  ],
  power: [
    { value: 'W', label: 'W', ariaLabel: 'watts (W)' },
    { value: 'mW', label: 'mW', ariaLabel: 'milliwatts (mW)' },
    { value: 'dBm', label: 'dBm', ariaLabel: 'dB milliwatt (dBm)' },
  ],
};

const Y_QUICK_OPTIONS: readonly { value: string; label: string; ariaLabel: string; title?: string }[] = [
  { value: '__header', label: 'Auto', ariaLabel: 'From column names', title: 'Read each column unit from its header' },
  { value: 'V', label: 'V', ariaLabel: 'volts (V)' },
  { value: 'mV', label: 'mV', ariaLabel: 'millivolts (mV)' },
  { value: 'dBm', label: 'dBm', ariaLabel: 'dB milliwatt (dBm)' },
];

/** Only units not already present in Y_QUICK_OPTIONS — no duplicates. */
const Y_MORE_GROUPS: readonly { label: string; items: readonly { id: string; label: string; ariaLabel: string }[] }[] = [
  {
    label: 'Log',
    items: [
      { id: 'dB', label: 'dB', ariaLabel: 'decibels (dB)' },
      { id: 'dBi', label: 'dBi', ariaLabel: 'gain relative to isotropic (dBi)' },
      { id: 'dBV', label: 'dBV', ariaLabel: 'dB volt (dBV)' },
    ],
  },
  {
    label: 'Electrical',
    items: [
      { id: 'µV', label: 'µV', ariaLabel: 'microvolts (µV)' },
      { id: 'A', label: 'A', ariaLabel: 'amperes (A)' },
      { id: 'mA', label: 'mA', ariaLabel: 'milliamperes (mA)' },
      { id: 'W', label: 'W', ariaLabel: 'watts (W)' },
      { id: 'mW', label: 'mW', ariaLabel: 'milliwatts (mW)' },
      { id: 'Ohm', label: 'Ω', ariaLabel: 'ohms (Ohm)' },
    ],
  },
];

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export const CONFIDENCE_ICON: Record<ConfidenceLevel, 'check' | 'info' | 'warning'> = {
  high: 'check',
  medium: 'info',
  low: 'warning',
};

function shortUnitFace(id: string | undefined): string {
  if (id === undefined) return 'Auto';
  if (id === '') return 'None';
  if (id === 'Ohm') return 'Ω';
  return id;
}

function extraXGroupFor(unitId: string | undefined) {
  return unitId !== undefined ? X_MORE_QUANTITIES.find(group => group.units.includes(unitId)) : undefined;
}

export interface WizardDetectedInfo {
  readonly xLabel: string;
  readonly xUnit: string | undefined;
  readonly score: number;
  readonly level: ConfidenceLevel;
  readonly reasons: readonly string[];
}

export interface WizardSettingsProps {
  config: WizardConfig;
  maxSkipRows: number;
  detected: WizardDetectedInfo;
  headers?: readonly string[];
  numeric?: readonly number[];
  onChange: (next: WizardConfig) => void;
  onLayout: (delimiter: string, skipRows: number, valueDelimiter?: WizardDelimiter) => void;
}

const NETWORK_PORTS: readonly { value: '1' | '2' | '3' | '4'; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

const NETWORK_FORMATS: readonly { value: 'RI' | 'MA' | 'DB'; label: string; ariaLabel: string }[] = [
  { value: 'RI', label: 'RI', ariaLabel: 'Real and Imaginary' },
  { value: 'MA', label: 'MA', ariaLabel: 'Magnitude and Angle' },
  { value: 'DB', label: 'DB', ariaLabel: 'dB and Angle' },
];

const NETWORK_ANGLES: readonly { value: 'deg' | 'rad'; label: string; ariaLabel: string }[] = [
  { value: 'deg', label: 'deg', ariaLabel: 'Degrees' },
  { value: 'rad', label: 'rad', ariaLabel: 'Radians' },
];

function networkPairLabels(format: WizardNetworkConfig['format']): readonly [string, string] {
  if (format === 'RI') return ['Re', 'Im'];
  if (format === 'DB') return ['dB', 'Ang'];
  return ['Mag', 'Ang'];
}

export function WizardSettings({ config, maxSkipRows, detected, headers, numeric, onChange, onLayout }: WizardSettingsProps) {
  const skipId = useId();
  const z0Id = useId();
  const [showSecondSeparator, setShowSecondSeparator] = useState(() => Boolean(config.valueDelimiter));
  const [xMoreAnchor, setXMoreAnchor] = useState<HTMLElement | null>(null);
  const [yMoreAnchor, setYMoreAnchor] = useState<HTMLElement | null>(null);
  const [cellAnchor, setCellAnchor] = useState<{ row: number; col: number; at: HTMLElement } | null>(null);
  const [xCustomPicked, setXCustomPicked] = useState(false);
  const [yCustomPicked, setYCustomPicked] = useState(false);
  const [z0Draft, setZ0Draft] = useState(() => String(config.network?.referenceOhms ?? 50));

  useEffect(() => {
    const ref = config.network?.referenceOhms;
    if (ref === undefined) return;
    const parsed = Number(z0Draft.trim());
    if (!Number.isFinite(parsed) || parsed !== ref) {
      setZ0Draft(String(ref));
    }
  }, [config.network?.referenceOhms]);

  const colHeaders = headers ?? config.headers;
  const numCols = numeric ?? colHeaders.map((_, idx) => idx);
  const network = config.network;
  const isNetwork = Boolean(network);

  const mixedOpen = showSecondSeparator || Boolean(config.valueDelimiter);
  const delimiter = DELIMITERS.some(item => item.value === config.delimiter) ? (config.delimiter as WizardDelimiter) : ',';
  const setSkip = (value: number) => onLayout(config.delimiter, Math.max(0, Math.min(maxSkipRows, Math.floor(Number.isFinite(value) ? value : 0))), config.valueDelimiter);

  const xUnitObj = findXUnit(config.xUnit);
  const xCustom = hasCustomMultiplier(config, 'x') || xCustomPicked;
  const xCategory = xUnitObj?.category ?? (config.domain === 'time' ? 'time' : 'frequency');
  const xIsPrimary = !xCustom && (xCategory === 'frequency' || xCategory === 'time' || xCategory === 'angle');
  const xExtraGroup = !xCustom && !xIsPrimary ? extraXGroupFor(config.xUnit) : undefined;
  const xMoreFace = xCustom ? '×N' : xExtraGroup ? xExtraGroup.face : !xIsPrimary ? shortUnitFace(config.xUnit) : 'More';
  const xScaleKey = xIsPrimary ? xCategory : xExtraGroup?.id;
  const xScaleRow = !xCustom && xScaleKey ? X_SCALE_ROWS[xScaleKey] : undefined;

  const yCustom = hasCustomMultiplier(config, 'y') || yCustomPicked;
  const yQuickValue = yCustom ? null : config.yUnit === undefined ? '__header' : Y_QUICK_OPTIONS.some(o => o.value === config.yUnit) ? config.yUnit : null;
  const yMoreActive = yQuickValue === null;
  const yMoreFace = yCustom ? '×N' : yMoreActive ? shortUnitFace(config.yUnit) : 'More';

  const pct = Math.round(Math.max(0, Math.min(1, detected.score)) * 100);
  const detectedAxisText = detected.xUnit ? `${detected.xLabel} (${detected.xUnit})` : detected.xLabel;

  const pickXUnit = (unitId: string) => {
    setXCustomPicked(false);
    setXMoreAnchor(null);
    onChange(setXUnit(config, unitId));
  };

  const pickYUnit = (unitId: string | undefined) => {
    setYCustomPicked(false);
    setYMoreAnchor(null);
    onChange(setYUnit(config, unitId));
  };

  const switchMode = (mode: 'traces' | 'network') => {
    if (mode === 'network') {
      if (config.network) return;
      const suggested = detectSParameterNetwork(colHeaders, numCols, config.xCol);
      const candidates = numCols.filter(col => col !== config.xCol);
      const c0 = candidates[0];
      const c1 = candidates[1];
      const fallback: WizardNetworkConfig = {
        portCount: 1,
        format: 'RI',
        angleUnit: 'deg',
        referenceOhms: 50,
        cells: c0 !== undefined && c1 !== undefined ? [{ row: 0, col: 0, first: c0, second: c1 }] : [],
      };
      const freqBase = config.domain === 'frequency' && xCategory === 'frequency'
        ? { domain: 'frequency' as const, xUnit: config.xUnit ?? 'Hz', xMult: config.xMult }
        : { domain: 'frequency' as const, xUnit: 'Hz', xMult: 1 };
      onChange({ ...config, ...freqBase, network: suggested ?? fallback });
      return;
    }
    if (!config.network) return;
    const { network: _removed, ...rest } = config;
    const yCols = rest.yCols.length > 0 ? rest.yCols : numCols.filter(col => col !== rest.xCol);
    onChange({ ...rest, yCols });
  };

  const updateNetwork = (patch: Partial<WizardNetworkConfig>) => {
    if (!network) return;
    onChange({ ...config, network: { ...network, ...patch } });
  };

  const updateCellMapping = (row: number, col: number, which: 'first' | 'second', colIndex: number) => {
    if (!network) return;
    // Remove colIndex from any other slot if reassigned so the user isn't trapped in a duplicate-column state.
    const cleaned = colIndex >= 0
      ? network.cells
        .map(cell => {
          if (cell.row === row && cell.col === col) return cell;
          const first = cell.first === colIndex ? -1 : cell.first;
          const second = cell.second === colIndex ? -1 : cell.second;
          return { ...cell, first, second };
        })
        .filter(cell => cell.first >= 0 || cell.second >= 0)
      : network.cells;
    const existing = cleaned.find(cell => cell.row === row && cell.col === col);
    const otherSlot = which === 'first' ? (existing?.second ?? -1) : (existing?.first ?? -1);
    const nextFirst = which === 'first' ? colIndex : (otherSlot === colIndex ? -1 : otherSlot);
    const nextSecond = which === 'second' ? colIndex : (otherSlot === colIndex ? -1 : otherSlot);
    const others = cleaned.filter(cell => !(cell.row === row && cell.col === col));
    const nextCells = nextFirst < 0 && nextSecond < 0
      ? others
      : [...others, { row, col, first: nextFirst, second: nextSecond }].sort((a, b) => (a.row - b.row) || (a.col - b.col));
    updateNetwork({ cells: nextCells });
  };

  const clearCellMapping = (row: number, col: number) => {
    if (!network) return;
    updateNetwork({ cells: network.cells.filter(cell => !(cell.row === row && cell.col === col)) });
  };

  const activeCell = cellAnchor && network
    ? network.cells.find(item => item.row === cellAnchor.row && item.col === cellAnchor.col)
    : undefined;

  return (
    <div className="iw-settings">
      <section className="iw-group" aria-label="Format">
        <h3 className="t-section">Format</h3>
        <div className="iw-line">
          <span className="t-label t-muted">{mixedOpen ? 'First sep' : 'Separator'}</span>
          <div className="iw-seg">
            <Segmented
              label={mixedOpen ? 'First separator' : 'Separator'}
              options={DELIMITERS}
              value={delimiter}
              onChange={value => onLayout(value, config.skipRows, config.valueDelimiter === value ? undefined : config.valueDelimiter)}
            />
          </div>
        </div>
        <label className="iw-check t-caption">
          <input
            type="checkbox"
            checked={mixedOpen}
            onChange={event => {
              const checked = event.target.checked;
              setShowSecondSeparator(checked);
              if (!checked && config.valueDelimiter !== undefined) {
                onLayout(delimiter, config.skipRows, undefined);
              }
            }}
          />
          Different separator after first column
        </label>
        {mixedOpen && (
          <div className="iw-line">
            <span className="t-label t-muted">After col 1</span>
            <div className="iw-seg">
              <Segmented
                label="Between remaining values"
                options={DELIMITERS}
                value={config.valueDelimiter ?? delimiter}
                onChange={value => onLayout(delimiter, config.skipRows, value === delimiter ? undefined : value)}
              />
            </div>
          </div>
        )}
        <div className="iw-line">
          <label className="t-label t-muted" htmlFor={skipId}>Skip rows</label>
          <input id={skipId} className="iw-input t-label" type="number" min={0} max={maxSkipRows} step={1} value={config.skipRows} onChange={event => setSkip(Number(event.target.value))} />
        </div>
        <div className="iw-line">
          <span className="t-label t-muted">Data</span>
          <div className="iw-seg">
            <Segmented
              label="Table import mode"
              options={[
                { value: 'traces', label: 'Traces', title: 'Import numeric columns as scalar traces' },
                { value: 'network', label: 'S-parameters', title: 'Import paired columns as an S-parameter network' },
              ]}
              value={isNetwork ? 'network' : 'traces'}
              onChange={mode => { setCellAnchor(null); switchMode(mode); }}
            />
          </div>
        </div>
      </section>

      {network ? (
        <>
          <section className="iw-group" aria-label="Frequency axis">
            <h3 className="t-section">Frequency</h3>
            <div className="iw-seg">
              <Segmented
                label="Frequency unit"
                options={X_SCALE_ROWS.frequency ?? []}
                value={config.xUnit ?? 'Hz'}
                onChange={pickXUnit}
              />
            </div>
            {xCustom && (
              <MultiplierField
                label="X in multiplier"
                mult={config.xMult}
                onMult={xMult => onChange({ ...config, xMult })}
              />
            )}
          </section>

          <section className="iw-group" aria-label="S-parameters">
            <h3 className="t-section">S-parameters</h3>
            <div className="iw-line">
              <span className="t-label t-muted">Ports</span>
              <div className="iw-seg">
                <Segmented
                  label="Port count"
                  options={NETWORK_PORTS}
                  value={String(network.portCount) as '1' | '2' | '3' | '4'}
                  onChange={val => {
                    const portCount = Number(val) as 1 | 2 | 3 | 4;
                    setCellAnchor(null);
                    updateNetwork({
                      portCount,
                      cells: network.cells.filter(cell => cell.row < portCount && cell.col < portCount),
                    });
                  }}
                />
              </div>
            </div>
            <div className="iw-line">
              <span className="t-label t-muted">Format</span>
              <div className="iw-seg">
                <Segmented
                  label="Data format"
                  options={NETWORK_FORMATS}
                  value={network.format}
                  onChange={format => updateNetwork({ format })}
                />
              </div>
            </div>
            {network.format !== 'RI' && (
              <div className="iw-line">
                <span className="t-label t-muted">Angle</span>
                <div className="iw-seg">
                  <Segmented
                    label="Angle unit"
                    options={NETWORK_ANGLES}
                    value={network.angleUnit}
                    onChange={angleUnit => updateNetwork({ angleUnit })}
                  />
                </div>
              </div>
            )}
            <div className="iw-line">
              <label className="t-label t-muted" htmlFor={z0Id}>Z₀ (Ω)</label>
              <input
                id={z0Id}
                className="iw-input iw-input--mult t-label"
                type="text"
                inputMode="decimal"
                aria-label="Reference impedance in ohms"
                value={z0Draft}
                onChange={event => {
                  const raw = event.target.value;
                  setZ0Draft(raw);
                  const parsed = Number(raw.trim());
                  if (Number.isFinite(parsed) && parsed > 0) updateNetwork({ referenceOhms: parsed });
                }}
                onBlur={() => {
                  const parsed = Number(z0Draft.trim());
                  if (!Number.isFinite(parsed) || parsed <= 0) setZ0Draft(String(network.referenceOhms));
                }}
              />
            </div>
            <div
              className="iw-sparam-matrix"
              style={{ gridTemplateColumns: `repeat(${network.portCount}, minmax(0, 1fr))` }}
              role="group"
              aria-label="Mapped S-parameter matrix"
            >
              {Array.from({ length: network.portCount }, (_, row) =>
                Array.from({ length: network.portCount }, (_, col) => {
                  const cell = network.cells.find(item => item.row === row && item.col === col);
                  const hasFirst = cell !== undefined && cell.first >= 0 && cell.first < colHeaders.length;
                  const hasSecond = cell !== undefined && cell.second >= 0 && cell.second < colHeaders.length;
                  const state = hasFirst && hasSecond ? 'mapped' : (hasFirst || hasSecond) ? 'partial' : 'empty';
                  const [firstLabel, secondLabel] = networkPairLabels(network.format);
                  const cellName = `S${row + 1}${col + 1}`;
                  const isOpen = cellAnchor?.row === row && cellAnchor?.col === col;
                  const firstColName = hasFirst && cell ? (colHeaders[cell.first] ?? `Col ${cell.first + 1}`) : '—';
                  const secondColName = hasSecond && cell ? (colHeaders[cell.second] ?? `Col ${cell.second + 1}`) : '—';
                  const tooltip = state === 'empty'
                    ? `${cellName}: not mapped (click to assign columns)`
                    : `${cellName}: ${firstLabel} = ${firstColName}, ${secondLabel} = ${secondColName}`;
                  return (
                    <button
                      key={cellName}
                      type="button"
                      className={`iw-sparam-cell t-label is-${state}${isOpen ? ' is-open' : ''}`}
                      data-testid={`sparam-matrix-cell-${row}-${col}`}
                      aria-haspopup="dialog"
                      aria-expanded={isOpen}
                      title={tooltip}
                      onClick={event => {
                        const at = event.currentTarget;
                        setCellAnchor(current => (current?.row === row && current?.col === col ? null : { row, col, at }));
                      }}
                    >
                      <span>{cellName}</span>
                      {state === 'mapped' && <span className="iw-sparam-dot" aria-hidden="true" />}
                      {state === 'partial' && <span className="iw-sparam-dot is-warn" aria-hidden="true" />}
                    </button>
                  );
                }),
              )}
            </div>
            <span className="t-caption t-muted">Click a matrix cell or any table column chip to map.</span>
          </section>
        </>
      ) : (
        <>
          <section className="iw-group" aria-label="X axis">
            <h3 className="t-section">X axis</h3>
            <div className="iw-seg">
              <div className="ui-segmented" role="radiogroup" aria-label="X axis quantity">
                {X_PRIMARY_GROUPS.map(group => {
                  const active = xIsPrimary && xCategory === group.value;
                  return (
                    <Btn
                      key={group.value}
                      role="radio"
                      variant="slate"
                      active={active}
                      aria-checked={active}
                      aria-label={group.ariaLabel}
                      onClick={() => pickXUnit(active ? (config.xUnit ?? group.defaultUnit) : group.defaultUnit)}
                    >
                      {group.label}
                    </Btn>
                  );
                })}
                <Btn
                  variant="slate"
                  active={!xIsPrimary || Boolean(xMoreAnchor)}
                  aria-label="More X units"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(xMoreAnchor)}
                  onClick={event => {
                    const target = event.currentTarget;
                    setXMoreAnchor(current => (current ? null : target));
                  }}
                >
                  <span className="iw-more-face">{xMoreFace}<CaretDownIcon /></span>
                </Btn>
              </div>
            </div>
            {xScaleRow && (
              <div className="iw-seg">
                <Segmented
                  label="X unit"
                  options={xScaleRow}
                  value={config.xUnit ?? xScaleRow[0]?.value ?? ''}
                  onChange={pickXUnit}
                />
              </div>
            )}
            {xCustom && (
              <MultiplierField
                label="X in multiplier"
                mult={config.xMult}
                onMult={xMult => onChange({ ...config, xMult })}
              />
            )}
            <label className="iw-check t-label">
              <input
                type="checkbox"
                checked={config.breakSweepGaps ?? false}
                onChange={event => onChange({ ...config, breakSweepGaps: event.target.checked })}
              />
              Break lines at sweep gaps
            </label>
          </section>

          <section className="iw-group" aria-label="Y axis">
            <h3 className="t-section">Y axis</h3>
            <div className="iw-seg">
              <div className="ui-segmented" role="radiogroup" aria-label="Y unit">
                {Y_QUICK_OPTIONS.map(option => {
                  const active = yQuickValue === option.value;
                  return (
                    <Btn
                      key={option.value}
                      role="radio"
                      variant="slate"
                      active={active}
                      aria-checked={active}
                      aria-label={option.ariaLabel}
                      title={option.title}
                      onClick={() => pickYUnit(option.value === '__header' ? undefined : option.value)}
                    >
                      {option.label}
                    </Btn>
                  );
                })}
                <Btn
                  variant="slate"
                  active={yMoreActive || Boolean(yMoreAnchor)}
                  aria-label="More Y units"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(yMoreAnchor)}
                  onClick={event => {
                    const target = event.currentTarget;
                    setYMoreAnchor(current => (current ? null : target));
                  }}
                >
                  <span className="iw-more-face">{yMoreFace}<CaretDownIcon /></span>
                </Btn>
              </div>
            </div>
            {yCustom && (
              <MultiplierField
                label="Y in multiplier"
                mult={config.yMult}
                onMult={yMult => onChange({ ...config, yMult })}
              />
            )}
            {config.yUnit === undefined && !yCustom && (
              <span className="t-caption">Using each column&apos;s own header unit.</span>
            )}
          </section>
        </>
      )}

      <section className="iw-group" aria-label="Auto-detect confidence">
        <h3 className="t-section">Auto-detect</h3>
        <div className={`iw-detect is-${detected.level}`} data-testid="import-wizard-detected" data-confidence-level={detected.level}>
          <span className={`iw-detect-icon is-${detected.level}`}><Icon name={CONFIDENCE_ICON[detected.level]} /></span>
          <span className="t-label">{CONFIDENCE_LABEL[detected.level]} · {pct}%</span>
          <span className="t-caption">{detectedAxisText}</span>
        </div>
        {detected.level === 'low' && detected.reasons.length > 0 && (
          <div data-testid="import-wizard-reasons">
            <MessageBar status="warning">
              {detected.reasons.join('. ')}. Check axis and units before importing.
            </MessageBar>
          </div>
        )}
        {detected.level !== 'low' && detected.reasons.length > 0 && (
          <ul className="iw-reasons" data-testid="import-wizard-reasons">
            {detected.reasons.map((reason, index) => (
              <li key={index} className="t-caption">{reason}</li>
            ))}
          </ul>
        )}
      </section>

      {cellAnchor && network && (() => {
        const { row, col, at } = cellAnchor;
        const cellName = `S${row + 1}${col + 1}`;
        const [firstLabel, secondLabel] = networkPairLabels(network.format);
        return (
          <PopoverAt
            label={`Map ${cellName}`}
            at={at}
            onClose={() => setCellAnchor(null)}
            onEscape={() => { setCellAnchor(null); at.focus(); }}
          >
            <div className="iw-sparam-pop" role="dialog" aria-label={`Map ${cellName}`}>
              <div className="iw-sparam-pop-head">
                <span className="t-card-title">{cellName}</span>
                {activeCell && (
                  <Btn
                    small
                    onClick={() => {
                      clearCellMapping(row, col);
                      setCellAnchor(null);
                      at.focus();
                    }}
                  >
                    Clear
                  </Btn>
                )}
              </div>
              <div className="iw-field">
                <span className="t-caption t-muted">{firstLabel} column</span>
                <select
                  className="ui-select t-label"
                  aria-label={`${cellName} ${firstLabel}`}
                  data-testid={`sparam-cell-${row}-${col}-first`}
                  value={activeCell ? String(activeCell.first) : '-1'}
                  onChange={event => updateCellMapping(row, col, 'first', Number(event.target.value))}
                >
                  <option value="-1">— not mapped</option>
                  {colHeaders.map((header, idx) => (
                    <option key={idx} value={String(idx)} disabled={idx === config.xCol || !numCols.includes(idx)}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              <div className="iw-field">
                <span className="t-caption t-muted">{secondLabel} column</span>
                <select
                  className="ui-select t-label"
                  aria-label={`${cellName} ${secondLabel}`}
                  data-testid={`sparam-cell-${row}-${col}-second`}
                  value={activeCell ? String(activeCell.second) : '-1'}
                  onChange={event => updateCellMapping(row, col, 'second', Number(event.target.value))}
                >
                  <option value="-1">— not mapped</option>
                  {colHeaders.map((header, idx) => (
                    <option key={idx} value={String(idx)} disabled={idx === config.xCol || !numCols.includes(idx)}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </PopoverAt>
        );
      })()}

      {xMoreAnchor && (
        <PopoverAt
          label="More X units"
          at={xMoreAnchor}
          onClose={() => setXMoreAnchor(null)}
          onEscape={() => { const at = xMoreAnchor; setXMoreAnchor(null); at.focus(); }}
        >
          <div className="iw-unit-pop" role="menu" aria-label="More X units">
            <div className="iw-unit-pop-group">
              <span className="iw-unit-pop-title t-caption">Electrical / RF</span>
              <div className="iw-unit-grid">
                {X_MORE_QUANTITIES.map(group => {
                  const selected = !xCustom && xExtraGroup?.id === group.id;
                  return (
                    <Btn
                      key={group.id}
                      role="menuitemradio"
                      variant="slate"
                      small
                      active={selected}
                      aria-checked={selected}
                      onClick={() => pickXUnit(selected ? (config.xUnit ?? group.defaultUnit) : group.defaultUnit)}
                    >
                      {group.label}
                    </Btn>
                  );
                })}
              </div>
            </div>
            <div className="iw-unit-pop-group">
              <span className="iw-unit-pop-title t-caption">Other</span>
              <div className="iw-unit-grid">
                <Btn
                  role="menuitemradio"
                  variant="slate"
                  small
                  active={!xCustom && config.xUnit === ''}
                  aria-checked={!xCustom && config.xUnit === ''}
                  onClick={() => pickXUnit('')}
                >
                  No unit
                </Btn>
                <Btn
                  role="menuitemradio"
                  variant="slate"
                  small
                  active={xCustom}
                  aria-checked={xCustom}
                  onClick={() => {
                    setXCustomPicked(true);
                    setXMoreAnchor(null);
                    onChange({ ...config, xUnit: config.xUnit ?? (config.domain === 'time' ? 's' : 'Hz') });
                  }}
                >
                  Custom (×N)…
                </Btn>
              </div>
            </div>
          </div>
        </PopoverAt>
      )}

      {yMoreAnchor && (
        <PopoverAt
          label="More Y units"
          at={yMoreAnchor}
          onClose={() => setYMoreAnchor(null)}
          onEscape={() => { const at = yMoreAnchor; setYMoreAnchor(null); at.focus(); }}
        >
          <div className="iw-unit-pop" role="menu" aria-label="More Y units">
            {Y_MORE_GROUPS.map(group => (
              <div key={group.label} className="iw-unit-pop-group">
                <span className="iw-unit-pop-title t-caption">{group.label}</span>
                <div className="iw-unit-grid">
                  {group.items.map(item => {
                    const selected = !yCustom && config.yUnit === item.id;
                    return (
                      <Btn
                        key={item.id}
                        role="menuitemradio"
                        variant="slate"
                        small
                        active={selected}
                        aria-checked={selected}
                        aria-label={item.ariaLabel}
                        onClick={() => pickYUnit(item.id)}
                      >
                        {item.label}
                      </Btn>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="iw-unit-pop-group">
              <span className="iw-unit-pop-title t-caption">Other</span>
              <div className="iw-unit-grid">
                <Btn
                  role="menuitemradio"
                  variant="slate"
                  small
                  active={!yCustom && config.yUnit === ''}
                  aria-checked={!yCustom && config.yUnit === ''}
                  onClick={() => pickYUnit('')}
                >
                  No unit
                </Btn>
                <Btn
                  role="menuitemradio"
                  variant="slate"
                  small
                  active={yCustom}
                  aria-checked={yCustom}
                  onClick={() => {
                    setYCustomPicked(true);
                    setYMoreAnchor(null);
                    const fallback = findYUnit(config.yUnit)?.id ?? config.yUnit ?? '';
                    onChange({ ...config, yUnit: fallback });
                  }}
                >
                  Custom (×N)…
                </Btn>
              </div>
            </div>
          </div>
        </PopoverAt>
      )}
    </div>
  );
}

interface MultiplierFieldProps {
  label: string;
  mult: number;
  onMult: (mult: number) => void;
}

function MultiplierField({ label, mult, onMult }: MultiplierFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => String(mult));

  useEffect(() => {
    const parsed = Number(draft.trim());
    if (!Number.isFinite(parsed) || parsed !== mult) {
      setDraft(String(mult));
    }
  }, [mult]);

  return (
    <div className="iw-line">
      <label className="t-label t-muted" htmlFor={id}>Scale ×</label>
      <input
        id={id}
        className="iw-input iw-input--mult t-label"
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        onChange={event => {
          const raw = event.target.value;
          setDraft(raw);
          const trimmed = raw.trim();
          if (trimmed === '') return;
          const next = Number(trimmed);
          if (Number.isFinite(next) && next !== 0) onMult(next);
        }}
        onBlur={() => {
          const next = Number(draft.trim());
          if (!Number.isFinite(next) || next === 0) setDraft(String(mult));
        }}
      />
    </div>
  );
}
