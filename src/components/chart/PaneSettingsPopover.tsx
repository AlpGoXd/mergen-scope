import React from 'react';
import type { PaneSettings } from '../../types/pane';
import { usePaneDispatch } from '../../stores/pane-store';
import { Btn } from '../shared/Btn';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <input
      type="checkbox"
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
}: {
  paneId: string;
  settings: PaneSettings;
}) {
  const [open, setOpen] = React.useState(false);
  const paneDispatch = usePaneDispatch();
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <Btn
        soft
        active={open}
        style={{ padding: '0.2rem 0.45rem', fontSize: 'var(--font-caption)', minHeight: 'auto' }}
        title="Pane settings"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
      >
        ⚙
      </Btn>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 300,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 14px',
            minWidth: 250,
            boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
            fontSize: 'var(--font-body)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 'var(--font-label)', color: 'var(--text)' }}>
            Pane {paneNum} Settings
          </div>

          <Section title="Grid">
            <Row label="Major grid">
              <Toggle checked={settings.gridMajor} onChange={v => patch({ gridMajor: v })} />
            </Row>
            <Row label="Minor grid">
              <Toggle checked={settings.gridMinor} onChange={v => patch({ gridMinor: v })} />
            </Row>
            {settings.gridMinor && (
              <div style={{ fontSize: '11px', color: 'var(--muted)', paddingLeft: 2 }}>
                Minor grid not supported yet
              </div>
            )}
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
          </Section>

          <Section title="Display">
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
          </Section>
        </div>
      )}
    </div>
  );
}
