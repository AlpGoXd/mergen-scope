import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import './settings-sheet.css';
import { COLOUR_BLIND_ORDER } from '../../domain/trace-colors';
import { SOURCE_HUES } from '../../domain/trace-palette';
import { useSheetFocus } from '../../hooks/use-sheet-focus';
import { usePaneLimit } from '../../stores/pane-store';
import { useThemePreference, useUiDispatch } from '../../stores/ui-store';
import { FooterIcon } from '../layout/footer-icons';
import { applyAppSize } from './app-size';
import { appPreferencesKey, applyAppNeutral, defaultAppPreferences, readAppPreferences } from './app-preferences';
import type { AppPreferences } from './app-preferences';

export { defaultAppPreferences, readAppPreferences } from './app-preferences';
export type { AppPreferences } from './app-preferences';

const palettes = [
  { id: 'standard', name: 'Standard', caption: 'The 8-colour wheel.', hues: SOURCE_HUES },
  { id: 'colour-blind', name: 'Colour-blind safe', caption: 'The same wheel in a colour-blind-safe order; created traces too.', hues: COLOUR_BLIND_ORDER },
] as const;

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ss-row">
      <span className="ss-label t-label">{label}</span>
      <div className="ss-control">{children}</div>
    </div>
  );
}

function SegmentRow<T extends string>({ label, value, options, onChange, caption }: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  caption?: string;
}) {
  return (
    <SettingsRow label={label}>
      <div className="ss-seg" role="group" aria-label={label}>
        {options.map(([id, name]) => (
          <button className="t-label" key={id} type="button" aria-pressed={id === value} onClick={() => onChange(id)}>
            {name}
          </button>
        ))}
      </div>
      {caption && <p className="ss-caption t-caption">{caption}</p>}
    </SettingsRow>
  );
}

function PaletteCards({ value, onChange }: {
  value: AppPreferences['palette'];
  onChange: (palette: AppPreferences['palette']) => void;
}) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    // With two choices, every arrow moves to the other card, wrapping at either end.
    const next = 1 - index;
    const other = palettes[next];
    if (!other) return;
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
    onChange(other.id);
  };

  return (
    <div className="ss-palette" role="radiogroup" aria-label="Palette">
      {palettes.map(({ id, name, caption, hues }, index) => (
        <button className="ss-card" key={id} type="button" role="radio"
          aria-checked={value === id} tabIndex={value === id ? 0 : -1}
          aria-labelledby={`ss-palette-${id}`} aria-describedby={`ss-palette-caption-${id}`}
          onClick={() => onChange(id)} onKeyDown={event => move(event, index)}>
          <span className="ss-radio-dot" aria-hidden="true" />
          <span className="t-card-title" id={`ss-palette-${id}`}>{name}</span>
          <span className="ss-caption t-caption" id={`ss-palette-caption-${id}`}>{caption}</span>
          <span className="ss-swatches" aria-hidden="true">
            {hues.map(hue => (
              <span className="ss-swatch" key={hue} style={{ background: `var(--tr${SOURCE_HUES.indexOf(hue)})` }} />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}

/** App-wide display and export preferences, stored in this browser. */
export function SettingsSheet({ onClose, onShowShortcuts, onAbout, onPreferencesChange }: {
  onClose: () => void;
  onShowShortcuts?: () => void;
  onAbout?: () => void;
  onPreferencesChange?: (preferences: AppPreferences) => void;
}) {
  const sheet = useSheetFocus<HTMLElement>();
  const [prefs, setPrefs] = useState(readAppPreferences);
  const { preference, setPreference } = useThemePreference();
  const { limit, setExperimental } = usePaneLimit();
  const uiDispatch = useUiDispatch();

  const update = (next: AppPreferences) => {
    setPrefs(next);
    applyAppSize(next.size);
    applyAppNeutral(next.neutral);
    try {
      localStorage.setItem(appPreferencesKey, JSON.stringify(next));
    } catch { /* Storage may be unavailable. */ }
    if (next.palette !== prefs.palette) {
      uiDispatch({ type: 'SET', payload: { key: 'huePalette', value: next.palette } });
    }
    window.dispatchEvent(new Event('mergen-preferences'));
    onPreferencesChange?.(next);
  };

  const reset = () => {
    update(defaultAppPreferences);
    setPreference('system');
    setExperimental(false);
  };

  return (
    <aside ref={sheet} className="ss" role="dialog" aria-labelledby="ss-title" tabIndex={-1}>
      <header className="ss-head">
        <FooterIcon name="settings" />
        <div>
          <h2 className="t-title" id="ss-title">App settings</h2>
          <p className="t-caption">All panes · saved in this browser</p>
        </div>
        <button className="ss-close t-title" type="button" onClick={onClose} aria-label="Close settings">×</button>
      </header>
      <div className="ss-body">
        <section className="ss-section">
          <h3 className="t-section">Appearance</h3>
          <SegmentRow label="Theme" value={preference} options={[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]} onChange={setPreference} />
          <SegmentRow label="Size" value={prefs.size} options={[['compact', 'Compact'], ['comfortable', 'Comfortable'], ['large', 'Large']]}
            onChange={size => update({ ...prefs, size })} caption="Compact 24 px controls, 26 px rows · Comfortable 28 / 30 · Large 32 / 34" />
          <SegmentRow label="Neutral colour" value={prefs.neutral} options={[['slate', 'Slate'], ['stone', 'Stone'], ['zinc', 'Zinc']]}
            onChange={neutral => update({ ...prefs, neutral })} caption="Changes the greys of the whole app, not the trace or tool colours." />
        </section>
        <section className="ss-section">
          <h3 className="t-section">Colours</h3>
          <SettingsRow label="Palette">
            <PaletteCards value={prefs.palette} onChange={palette => update({ ...prefs, palette })} />
          </SettingsRow>
          <SegmentRow label="Trace symbols" value={prefs.traceSymbols} options={[['off', 'Off'], ['repeat', 'Repeat'], ['always', 'Always']]}
            onChange={traceSymbols => update({ ...prefs, traceSymbols })} caption="Repeat shows symbols when colours repeat." />
        </section>
        <section className="ss-section">
          <h3 className="t-section">Export</h3>
          <SegmentRow label="Export theme" value={prefs.exportTheme} options={[['print', 'Print'], ['dark', 'Dark'], ['app', 'As app']]}
            onChange={exportTheme => update({ ...prefs, exportTheme })} caption="Used by Copy image, Download image and every export." />
        </section>
        <section className="ss-section">
          <h3 className="t-section">Experimental</h3>
          <SettingsRow label="Allow more than 4 panes">
            <button className="ss-switch" type="button" role="switch" aria-label="Allow more than 4 panes"
              aria-checked={limit === 8} aria-describedby="ss-pane-limit" onClick={() => setExperimental(limit === 4)} />
            <p className="ss-caption t-caption" id="ss-pane-limit">Up to 8 panes. Not recommended: panes get small and layouts beyond 4 are Rows and Columns.</p>
          </SettingsRow>
        </section>
        <div className="ss-divider" aria-hidden="true" />
        <button type="button" className="ss-link t-label" onClick={onShowShortcuts}>Keyboard shortcuts <span aria-hidden="true">›</span></button>
        <button type="button" className="ss-link t-label" onClick={onAbout}>About <span aria-hidden="true">›</span></button>
        <p className="ss-hint t-caption">Grid, markers, lines and Smith options are set per pane, with the sliders button in each pane header.</p>
      </div>
      <footer className="ss-foot">
        <button type="button" className="t-label" onClick={reset}>Reset all to defaults</button>
      </footer>
    </aside>
  );
}
