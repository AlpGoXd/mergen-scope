import React from 'react';
import type { PaneSettings } from '../../types/pane';
import type { SmithSettings } from '../../types/pane';
import { usePaneDispatch } from '../../stores/pane-store';
import { Btn } from '../shared/Btn';
import { PopoverAt } from '../shared/Controls';
import { ChartTypeTiles, PaneTypeMenu } from '../panes/PaneTypeMenu';
import type { TypeChangePlan } from '../panes/PaneTypeMenu';
import type { PickerTile, PickerTileId } from '../panes/PaneTypePicker';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div role="heading" aria-level={3} style={{
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--muted)',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 'var(--font-caption)', color: 'var(--text)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: 14, height: 14 }}
    />
  );
}

function NumInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [raw, setRaw] = React.useState(String(value));
  const [invalid, setInvalid] = React.useState(false);

  React.useEffect(() => {
    setRaw(String(value));
    setInvalid(false);
  }, [value]);

  const tryCommit = (s: string) => {
    const n = parseFloat(s);
    if (!isFinite(n) || n < min || n > max) { setInvalid(true); return; }
    setInvalid(false);
    onChange(n);
  };

  const commit = (s: string) => {
    const n = parseFloat(s);
    if (!isFinite(n)) { setInvalid(true); return; }
    const clamped = Math.min(max, Math.max(min, n));
    setInvalid(false);
    setRaw(String(clamped));
    onChange(clamped);
  };

  return (
    <input
      type="number"
      value={raw}
      min={min}
      max={max}
      step={step}
      onChange={e => { setRaw(e.target.value); tryCommit(e.target.value); }}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
      style={{
        width: 60,
        fontSize: 'var(--font-caption)',
        padding: '2px 4px',
        borderRadius: 4,
        border: `1px solid ${invalid ? 'var(--danger, #e55)' : 'var(--border)'}`,
        background: 'var(--bg)',
        color: 'var(--text)',
        textAlign: 'right',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PaneSettingsPopover({
  paneId,
  settings,
  sections,
  paneName,
  current,
  tiles,
  pending,
  anchor,
  onAnchorChange,
  onChoose,
  onConfirm,
  onCancel,
  contentRef,
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
}) {
  const paneDispatch = usePaneDispatch();

  const patch = (p: Partial<PaneSettings>) =>
    paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: p } });

  const paneNum = paneId.split('-')[1];

  const selectStyle: React.CSSProperties = {
    fontSize: 'var(--font-caption)',
    padding: '2px 4px',
    borderRadius: 4,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  };

  return (
    <div>
      <Btn
        soft
        active={anchor !== null}
        aria-expanded={anchor !== null}
        style={{ padding: '0.2rem 0.45rem', fontSize: 'var(--font-caption)', minHeight: 'auto' }}
        title="Pane settings"
        onClick={(e) => { e.stopPropagation(); onAnchorChange(anchor ? null : e.currentTarget); }}
      >
        ⚙
      </Btn>

      {anchor && <PopoverAt label={`Pane ${paneNum} settings`} at={anchor} onClose={() => onAnchorChange(null)}>
        <div
          ref={contentRef}
          style={{
            background: 'var(--card)',
            padding: '12px 14px',
            minWidth: 250,
            fontSize: 'var(--font-body)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {pending ? <PaneTypeMenu paneName={paneName} current={current} tiles={tiles} pending={pending} onChoose={onChoose} onConfirm={onConfirm} onCancel={onCancel} /> : <>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 'var(--font-label)', color: 'var(--text)' }}>
            Pane {paneNum} Settings
          </div>

          <Section title="Chart type">
            {current === 'eye' ? <span className="t-label">This pane belongs to the Eye diagram card on CH1.</span> : <ChartTypeTiles paneName={paneName} current={current} tiles={tiles} onChoose={onChoose} />}
          </Section>
          {sections.length === 0 && <div>No settings for this pane type yet.</div>}
          {sections.includes('display') && <Section title="Display">
            {current !== 'smith' && <Btn variant="chip" tone="pane" active={settings.showSampleDots} aria-pressed={settings.showSampleDots} aria-label="Samples" data-testid="sample-dots-toggle" style={{ width: '100%' }} onClick={() => patch({ showSampleDots: !settings.showSampleDots })}>Samples</Btn>}
            {current === 'smith' && <Row label="Outside range">
              {(['hidden', 'faint'] as const).map(value => <Btn key={value} variant="chip" tone="pane" active={(settings.smith.outside ?? 'hidden') === value} aria-pressed={(settings.smith.outside ?? 'hidden') === value} onClick={() => patch({ smith: { ...settings.smith, outside: value } })}>{value === 'hidden' ? 'Hidden' : 'Faint'}</Btn>)}
            </Row>}
            <Row label="Show markers">
              <Toggle checked={settings.showMarkers} onChange={v => patch({ showMarkers: v })} />
            </Row>
            <Row label="Marker labels">
              <Toggle checked={settings.showMarkerLabels} onChange={v => patch({ showMarkerLabels: v })} />
            </Row>
            <Row label="Reference lines">
              <Toggle checked={settings.showReferenceLines} onChange={v => patch({ showReferenceLines: v })} />
            </Row>
            <Row label="Line labels">
              <Toggle checked={settings.showLineLabels} onChange={v => patch({ showLineLabels: v })} />
            </Row>
          </Section>}

          {sections.includes('smith') && <Section title="Smith">
            {([
              ['Grid', 'grid', [['z', 'Z'], ['y', 'Y'], ['both', 'Z + Y']]],
              ['Labels', 'labels', [['normalised', 'Normalised'], ['ohms', 'Ohms'], ['off', 'Off']]],
              ['Direction', 'direction', [['chevrons', 'Chevrons + ends'], ['ends', 'Ends'], ['off', 'Off']]],
            ] as const).map(([label, key, options]) => <Row key={key} label={label}>
              {options.map(([value, text]) => <Btn key={value} variant="chip" tone="pane" active={settings.smith[key] === value} aria-pressed={settings.smith[key] === value} onClick={() => patch({ smith: { ...settings.smith, [key]: value } })}>{text}</Btn>)}
            </Row>)}
            <Row label="Readout">
              {([['z', 'Z'], ['y', 'Y'], ['gamma', '|Γ|∠'], ['vswr', 'VSWR'], ['return-loss', 'RL']] as const).map(([value, label]) => {
                const selected = settings.smith.readout.includes(value);
                return <Btn key={value} variant="chip" tone="pane" active={selected} aria-pressed={selected} onClick={() => {
                  const readout: SmithSettings['readout'] = selected ? settings.smith.readout.filter(field => field !== value) : [...settings.smith.readout, value];
                  patch({ smith: { ...settings.smith, readout } });
                }}>{label}</Btn>;
              })}
            </Row>
          </Section>}

          {sections.includes('grid') && <Section title="Grid">
            <Row label="Major grid">
              <Toggle checked={settings.gridMajor} onChange={v => patch({ gridMajor: v })} />
            </Row>
            <Row label="Opacity">
              <NumInput value={settings.gridMajorOpacity} min={0} max={1} step={0.05} onChange={v => patch({ gridMajorOpacity: v })} />
            </Row>
            <Row label="Thickness (px)">
              <NumInput value={settings.gridMajorThickness} min={0.5} max={5} step={0.5} onChange={v => patch({ gridMajorThickness: v })} />
            </Row>
            <Row label="Dash style">
              <select
                value={settings.gridDashStyle}
                onChange={e => patch({ gridDashStyle: e.target.value })}
                style={selectStyle}
              >
                <option value="3 3">Dashed</option>
                <option value="1 3">Dotted</option>
                <option value="6 3">Long dash</option>
                <option value="solid">Solid</option>
              </select>
            </Row>
          </Section>}
          </>}
        </div>
      </PopoverAt>}
    </div>
  );
}
