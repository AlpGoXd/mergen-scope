import React from 'react';
import type { PaneSettings, TableSettings } from '../../types/pane';
import type { TableVisibleRange } from '../../domain/table-view';
import type { SmithSettings } from '../../types/pane';
import type { SymbolSetting } from '../../domain/trace-palette';
import { usePaneDispatch } from '../../stores/pane-store';
import { appPreferencesKey, readAppPreferences } from '../settings/app-preferences';
import { Btn } from '../shared/Btn';
import { PopoverAt, Select, Tooltip } from '../shared/Controls';
import { ChartTypeTiles, PaneTypeMenu } from '../panes/PaneTypeMenu';
import type { TypeChangePlan } from '../panes/PaneTypeMenu';
import type { PickerTile, PickerTileId } from '../panes/PaneTypePicker';
import { GearIcon } from './PaneHeader';
import type { CopyChartResult } from './copy-chart';
import './pane-chrome.css';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pset-section">
      <div role="heading" aria-level={3} className="pset-head t-section">{title}</div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pset-row">
      <span className="pset-label t-label">{label}</span>
      <div className="pset-controls">{children}</div>
    </div>
  );
}

function Chip({ on, label, onToggle, testId }: { on: boolean; label: string; onToggle: () => void; testId?: string }) {
  return <Btn variant="chip" tone="pane" small active={on} aria-pressed={on} data-testid={testId} onClick={onToggle}>{label}</Btn>;
}

function NumInput({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = React.useState(String(value));
  const [invalid, setInvalid] = React.useState(false);
  React.useEffect(() => { setRaw(String(value)); setInvalid(false); }, [value]);
  const tryCommit = (s: string) => {
    const n = parseFloat(s);
    if (!isFinite(n) || n < min || n > max) { setInvalid(true); return; }
    setInvalid(false); onChange(n);
  };
  const commit = (s: string) => {
    const n = parseFloat(s);
    if (!isFinite(n)) { setInvalid(true); return; }
    const clamped = Math.min(max, Math.max(min, n));
    setInvalid(false); setRaw(String(clamped)); onChange(clamped);
  };
  return (
    <input type="number" className="pset-num t-readout" aria-label={label} aria-invalid={invalid || undefined} value={raw} min={min} max={max} step={step}
      onChange={e => { setRaw(e.target.value); tryCommit(e.target.value); }}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value); }} />
  );
}

/** Trace symbols is an app preference (Settings › Colours); it is repeated here because it changes what a pane shows. */
function useTraceSymbolSetting(): [SymbolSetting, (value: SymbolSetting) => void] {
  const [value, setValue] = React.useState<SymbolSetting>(() => readAppPreferences().traceSymbols);
  React.useEffect(() => {
    const update = () => setValue(readAppPreferences().traceSymbols);
    window.addEventListener('mergen-preferences', update);
    return () => window.removeEventListener('mergen-preferences', update);
  }, []);
  const change = (next: SymbolSetting) => {
    try { localStorage.setItem(appPreferencesKey, JSON.stringify({ ...readAppPreferences(), traceSymbols: next })); } catch { /* private mode: the choice lasts for this session */ }
    setValue(next);
    window.dispatchEvent(new Event('mergen-preferences'));
  };
  return [value, change];
}

export interface PaneAxes {
  /** "200 k/div". */
  readonly x: string;
  readonly y: string;
  readonly onFitX: () => void;
  readonly onFitY: () => void;
}
/** Table panes: the Table section (Rows, Follow, Range). */
export interface PaneTableOptions {
  readonly settings: TableSettings;
  readonly visible: TableVisibleRange;
}
export interface PaneActions {
  readonly onCopy: () => Promise<CopyChartResult>;
  /** Null when the pane has nothing to export. */
  readonly onExport: (() => void) | null;
  /** Null when this is the only pane. */
  readonly onClose: (() => void) | null;
}

/**
 * The one pane button (it replaces the old ⚙ and ⋯ pair). Sections, in order: Chart type, Display, Axes;
 * then a row of actions: Copy chart · Export… · Close pane. Changes apply at once; there is no OK.
 */
export function PaneSettingsPopover({
  paneId, settings, sections, paneName, current, tiles, pending, anchor, onAnchorChange, onChoose, onConfirm, onCancel, contentRef, axes, onFit, actions, table = null,
}: {
  paneId: string;
  settings: PaneSettings;
  sections: readonly string[];
  paneName: string;
  current: PickerTileId | 'eye';
  tiles: readonly PickerTile[];
  pending: TypeChangePlan | null;
  anchor: HTMLElement | null;
  onAnchorChange: (anchor: HTMLElement | null) => void;
  onChoose: (id: PickerTileId) => void;
  onConfirm: () => void;
  onCancel: () => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** Cartesian panes: per-axis scale and fit. Null when the pane has no axes to fit (empty, Smith). */
  axes: PaneAxes | null;
  /** Smith panes: fit the unit circle. */
  onFit: (() => void) | null;
  actions: PaneActions;
  table?: PaneTableOptions | null;
}) {
  const paneDispatch = usePaneDispatch();
  const patch = (p: Partial<PaneSettings>) => paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: p } });
  const [symbols, setSymbols] = useTraceSymbolSetting();
  const [copyState, setCopyState] = React.useState<CopyChartResult | null>(null);
  React.useEffect(() => { if (!anchor) setCopyState(null); }, [anchor]);
  const smith = current === 'smith';
  const setTable = (p: Partial<TableSettings>) => { if (table) patch({ table: { ...table.settings, ...p } }); };
  const close = () => onAnchorChange(null);

  return (
    <>
      <Btn variant="slate" small className="ph-gear" active={anchor !== null} aria-label="Pane settings" aria-haspopup="dialog" aria-expanded={anchor !== null} title="Pane settings"
        onClick={e => { e.stopPropagation(); onAnchorChange(anchor ? null : e.currentTarget); }}>
        <GearIcon />
      </Btn>

      {anchor && <PopoverAt label={`${paneName} settings`} at={anchor} onClose={close}>
        <div ref={contentRef} className="pset" onClick={e => e.stopPropagation()}>
          {pending ? <PaneTypeMenu paneName={paneName} current={current} tiles={tiles} pending={pending} onChoose={onChoose} onConfirm={onConfirm} onCancel={onCancel} /> : <>
            <div className="pset-title t-title">{paneName} settings</div>

            <Section title="Chart type">
              {current === 'eye' ? <span className="t-label">This pane belongs to the Eye diagram card on CH1.</span> : <ChartTypeTiles paneName={paneName} current={current} tiles={tiles} onChoose={onChoose} />}
            </Section>

            {table && <Section title="Table">
              <Row label="Rows">
                {([['near', 'Near cursor'], ['all', 'Every point']] as const).map(([value, text]) =>
                  <Btn key={value} variant="slate" small active={table.settings.rows === value} aria-pressed={table.settings.rows === value} onClick={() => setTable({ rows: value })}>{text}</Btn>)}
              </Row>
              <div className="pset-note t-caption">Near cursor: the rows around the cursor. Every point: all rows, scrolling.</div>
              <Row label="Follow">
                <Btn variant="slate" small active aria-pressed>Own traces</Btn>
              </Row>
              <Row label="Range">
                <Btn variant="slate" small active={table.settings.range === 'all' || !table.visible.available} aria-pressed={table.settings.range === 'all' || !table.visible.available} onClick={() => setTable({ range: 'all' })}>All</Btn>
                {table.visible.available
                  ? <Btn variant="slate" small active={table.settings.range === 'visible'} aria-pressed={table.settings.range === 'visible'} onClick={() => setTable({ range: 'visible' })}>Visible</Btn>
                  : <Tooltip text={table.visible.reason}><Btn variant="slate" small disabled aria-pressed={false}>Visible</Btn></Tooltip>}
              </Row>
              <div className="pset-note t-caption">{table.visible.available ? 'All is the default. Visible shows the linked pane’s X range.' : `All is the default. Visible: ${table.visible.reason.toLowerCase()}.`}</div>
            </Section>}

            {sections.includes('display') && <Section title="Display">
              <Row label="Show">
                <Chip on={settings.showSampleDots} label="Samples" testId="sample-dots-toggle" onToggle={() => patch({ showSampleDots: !settings.showSampleDots })} />
                <Chip on={settings.showMarkers} label="Markers" onToggle={() => patch({ showMarkers: !settings.showMarkers })} />
                <Chip on={settings.showMarkerLabels} label="Marker tags" onToggle={() => patch({ showMarkerLabels: !settings.showMarkerLabels })} />
                {!smith && <Chip on={settings.showReferenceLines} label="Lines" onToggle={() => patch({ showReferenceLines: !settings.showReferenceLines })} />}
                {!smith && <Chip on={settings.showLineLabels} label="Line tags" onToggle={() => patch({ showLineLabels: !settings.showLineLabels })} />}
              </Row>
              <Row label="Trace symbols">
                {([['off', 'Off'], ['repeat', 'When colours repeat'], ['always', 'Always']] as const).map(([value, text]) =>
                  <Btn key={value} variant="slate" small active={symbols === value} aria-pressed={symbols === value} onClick={() => setSymbols(value)}>{text}</Btn>)}
              </Row>
              <div className="pset-note t-caption">Trace symbols apply to every pane.</div>

              {sections.includes('grid') && <>
                <Row label="Grid">
                  <Chip on={settings.gridMajor} label="Grid lines" onToggle={() => patch({ gridMajor: !settings.gridMajor })} />
                  <Select aria-label="Grid line style" value={settings.gridDashStyle} onChange={e => patch({ gridDashStyle: e.target.value })}>
                    <option value="3 3">Dashed</option>
                    <option value="1 3">Dotted</option>
                    <option value="6 3">Long dash</option>
                    <option value="solid">Solid</option>
                  </Select>
                </Row>
                <Row label="Grid opacity">
                  <NumInput label="Grid opacity" value={settings.gridMajorOpacity} min={0} max={1} step={0.05} onChange={v => patch({ gridMajorOpacity: v })} />
                </Row>
                <Row label="Grid thickness">
                  <NumInput label="Grid thickness in pixels" value={settings.gridMajorThickness} min={0.5} max={5} step={0.5} onChange={v => patch({ gridMajorThickness: v })} />
                  <span className="t-caption">px</span>
                </Row>
              </>}

              {sections.includes('smith') && <>
                {([
                  ['Grid', 'grid', [['z', 'Z'], ['y', 'Y'], ['both', 'Z + Y']]],
                  ['Grid labels', 'labels', [['normalised', 'Normalised'], ['ohms', 'Ohms'], ['off', 'Off']]],
                  ['Direction', 'direction', [['chevrons', 'Chevrons + ends'], ['ends', 'Ends'], ['off', 'Off']]],
                ] as const).map(([label, key, options]) => <Row key={key} label={label}>
                  {options.map(([value, text]) => <Btn key={value} variant="slate" small active={settings.smith[key] === value} aria-pressed={settings.smith[key] === value} onClick={() => patch({ smith: { ...settings.smith, [key]: value } })}>{text}</Btn>)}
                </Row>)}
                <Row label="Outside range">
                  {(['hidden', 'faint'] as const).map(value => <Btn key={value} variant="slate" small active={(settings.smith.outside ?? 'hidden') === value} aria-pressed={(settings.smith.outside ?? 'hidden') === value} onClick={() => patch({ smith: { ...settings.smith, outside: value } })}>{value === 'hidden' ? 'Hidden' : 'Faint'}</Btn>)}
                </Row>
                <Row label="Readout">
                  {([['z', 'Z'], ['y', 'Y'], ['gamma', '|Γ|∠'], ['vswr', 'VSWR'], ['return-loss', 'RL']] as const).map(([value, label]) => {
                    const selected = settings.smith.readout.includes(value);
                    return <Chip key={value} on={selected} label={label} onToggle={() => {
                      const readout: SmithSettings['readout'] = selected ? settings.smith.readout.filter(field => field !== value) : [...settings.smith.readout, value];
                      patch({ smith: { ...settings.smith, readout } });
                    }} />;
                  })}
                </Row>
              </>}
            </Section>}

            {!table && <Section title="Axes">
              {axes ? <>
                <Row label="X"><span className="t-readout pset-scale">{axes.x}</span><Btn small onClick={axes.onFitX}>Fit X</Btn></Row>
                <Row label="Y"><span className="t-readout pset-scale">{axes.y}</span><Btn small onClick={axes.onFitY}>Fit Y</Btn></Row>
              </> : onFit ? <Row label="View"><Btn small onClick={onFit}>Fit the unit circle</Btn></Row>
                : <div className="pset-note t-caption">Add a trace to this pane to set its axes.</div>}
            </Section>}

            <div className="pset-actions" role="group" aria-label={`${paneName} actions`}>
              <Btn small onClick={() => { void actions.onCopy().then(setCopyState); }}>{copyState === 'copied' ? 'Copied' : 'Copy chart'}</Btn>
              {actions.onExport
                ? <Btn small title="Download this pane's traces as CSV" onClick={() => { actions.onExport?.(); close(); }}>Export…</Btn>
                : <Tooltip text="This pane has no traces to export"><Btn small disabled>Export…</Btn></Tooltip>}
              <span className="pset-actions__gap" />
              {actions.onClose
                ? <Btn small className="pset-close" onClick={() => { close(); actions.onClose?.(); }}>Close pane</Btn>
                : <Tooltip text="The last pane stays open"><Btn small className="pset-close" disabled>Close pane</Btn></Tooltip>}
            </div>
            {copyState && copyState !== 'copied' && <div className="pset-note t-caption" role="status">{copyState === 'unsupported' ? 'This browser cannot copy images. Use Export… instead.' : 'The chart could not be copied.'}</div>}
          </>}
        </div>
      </PopoverAt>}
    </>
  );
}
