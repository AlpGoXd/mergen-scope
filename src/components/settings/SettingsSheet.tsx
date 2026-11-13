import { useState } from 'react';
import './settings-sheet.css';
import { useThemePreference, useUiDispatch } from '../../stores/ui-store';
import { usePaneLimit } from '../../stores/pane-store';
import { APP_VERSION } from '../help/shortcuts';
import { FeedbackLinks, ShortcutList } from '../help/HelpSheet';
import { applyAppSize } from './app-size';
import { appPreferencesKey, defaultAppPreferences, readAppPreferences } from './app-preferences';
import type { AppPreferences } from './app-preferences';
export { defaultAppPreferences, readAppPreferences } from './app-preferences';
export type { AppPreferences } from './app-preferences';
export function SettingsSheet({ onClose, initialSection = 'settings', onPreferencesChange }: { onClose: () => void; initialSection?: 'settings' | 'shortcuts' | 'about'; onPreferencesChange?: (preferences: AppPreferences) => void }) {
  const [section, setSection] = useState(initialSection);
  const [prefs, setPrefs] = useState(readAppPreferences);
  const { preference, setPreference } = useThemePreference();
  const { limit, setExperimental } = usePaneLimit();
  const uiDispatch = useUiDispatch();
  const update = (next: AppPreferences) => { setPrefs(next); applyAppSize(next.size); try { localStorage.setItem(appPreferencesKey, JSON.stringify(next)); } catch { /* storage unavailable */ } if (next.palette !== prefs.palette) uiDispatch({ type: 'SET', payload: { key: 'huePalette', value: next.palette } }); window.dispatchEvent(new Event('mergen-preferences')); onPreferencesChange?.(next); };
  const choice = <T extends string>(label: string, value: T, options: readonly (readonly [T, string])[], set: (value: T) => void) => <div className="settings-row"><span className="t-label">{label}</span><div className="settings-segments" role="group" aria-label={label}>{options.map(([id, name]) => <button type="button" key={id} aria-pressed={id === value} onClick={() => set(id)}>{name}</button>)}</div></div>;
  return <section className="app-settings" role="dialog" aria-label="App settings">
    <header className="settings-header"><div><strong>App settings</strong><div className="t-caption">All panes &#183; saved in this browser</div></div><button className="settings-close" type="button" onClick={onClose} aria-label="Close settings">&times;</button></header>
    <div className="settings-body">
      {section !== 'settings' && <button className="settings-link" type="button" onClick={() => setSection('settings')}>&larr; App settings</button>}
      {section === 'shortcuts' ? <><h3>Keyboard shortcuts</h3><ShortcutList /></> : section === 'about' ? <><h3>About Mergen Scope</h3><p>Version {APP_VERSION} &#183; Apache-2.0</p><p><a href="https://github.com/AlpGoXd/mergen-scope" target="_blank" rel="noopener noreferrer">GitHub &#8599;</a></p><div style={{ display: 'grid', gap: 8 }}><FeedbackLinks /></div></> : <>
        <h3 className="t-section">Appearance</h3>
        {choice('Theme', preference, [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']] as const, setPreference)}
        {choice('Size', prefs.size, [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['large', 'Large']] as const, size => update({ ...prefs, size }))}
        <h3 className="t-section">Colours</h3>
        <div className="settings-row settings-palette"><span className="t-label">Palette</span><div role="radiogroup" aria-label="Palette">{(['standard', 'colour-blind'] as const).map(palette => <label className="settings-radio" key={palette}><input type="radio" name="palette" checked={prefs.palette === palette} onChange={() => update({ ...prefs, palette })} /><span>{palette === 'standard' ? 'Standard' : 'Colour-blind safe'}</span><span className="settings-swatches" aria-hidden="true">{(palette === 'standard' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 6, 1, 4, 3, 7, 5, 2]).map(index => <span key={index} style={{ background: `var(--tr${index})` }} />)}</span></label>)}</div></div>
        {choice('Trace symbols', prefs.traceSymbols, [['off', 'Off'], ['repeat', 'Repeat'], ['always', 'Always']] as const, traceSymbols => update({ ...prefs, traceSymbols }))}
        <p className="settings-caption t-caption">Repeat shows symbols when colours repeat.</p>
        <h3 className="t-section">Export</h3>
        {choice('Export theme', prefs.exportTheme, [['print', 'Print'], ['dark', 'Dark'], ['app', 'As app']] as const, exportTheme => update({ ...prefs, exportTheme }))}
        <h3 className="t-section">Experimental</h3>
        <label className="settings-row"><span className="t-label">Allow more than 4 panes</span><input type="checkbox" checked={limit === 8} onChange={event => setExperimental(event.target.checked)} /></label>
        <p className="settings-caption t-caption">Up to 8 panes. Not recommended: panes get small and layouts beyond 4 are Rows and Columns.</p>
        <div className="settings-navigation"><button type="button" onClick={() => setSection('shortcuts')}>Keyboard shortcuts <span>&rsaquo;</span></button><button type="button" onClick={() => setSection('about')}>About <span>&rsaquo;</span></button></div>
        <p className="settings-hint t-caption">Grid, markers, lines and Smith options are configured per pane using its sliders button.</p>
      </>}
    </div><footer className="settings-footer"><button type="button" onClick={() => { update(defaultAppPreferences); setPreference('system'); setExperimental(false); }}>Reset all to defaults</button></footer>
  </section>;
}
