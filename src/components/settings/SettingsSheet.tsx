import { useState } from 'react';
import { useThemePreference } from '../../stores/ui-store';
import { usePaneLimit } from '../../stores/pane-store';
import { APP_VERSION } from '../help/shortcuts';
import { FeedbackLinks, ShortcutList } from '../help/HelpSheet';
import { applyAppSize, DEFAULT_APP_SIZE, normalizeAppSize } from './app-size';
import type { AppSize } from './app-size';

export type AppPreferences = { size: AppSize; palette: 'standard' | 'colour-blind'; lineStyles: 'off' | 'traces-5-8' | 'all'; exportTheme: 'print' | 'dark' | 'app' };
export const defaultAppPreferences: AppPreferences = { size: DEFAULT_APP_SIZE, palette: 'standard', lineStyles: 'off', exportTheme: 'print' };
const key = 'mergen-app-preferences';
export function readAppPreferences(): AppPreferences {
  try { const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '{}'); if (typeof raw !== 'object' || raw === null) return defaultAppPreferences; const v = raw as Partial<AppPreferences>; return {
    size: normalizeAppSize(v.size), palette: v.palette === 'colour-blind' ? v.palette : 'standard', lineStyles: v.lineStyles === 'all' || v.lineStyles === 'traces-5-8' ? v.lineStyles : 'off', exportTheme: v.exportTheme === 'dark' || v.exportTheme === 'app' ? v.exportTheme : 'print',
  }; } catch { return defaultAppPreferences; }
}
export function SettingsSheet({ onClose, initialSection = 'settings', onPreferencesChange }: { onClose: () => void; initialSection?: 'settings' | 'shortcuts' | 'about'; onPreferencesChange?: (preferences: AppPreferences) => void }) {
  const [section, setSection] = useState(initialSection);
  const [prefs, setPrefs] = useState(readAppPreferences);
  const { preference, setPreference } = useThemePreference();
  const { limit, setExperimental } = usePaneLimit();
  const update = (next: AppPreferences) => { setPrefs(next); applyAppSize(next.size); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ } onPreferencesChange?.(next); };
  const choice = <T extends string>(label: string, value: T, options: readonly (readonly [T, string])[], set: (value: T) => void) => <fieldset style={{ border: 0, padding: 0, margin: '10px 0' }}><legend>{label}</legend><div style={{ display: 'flex', gap: 4 }}>{options.map(([id, name]) => <button type="button" key={id} aria-pressed={id === value} className={id === value ? 'btn-active' : ''} onClick={() => set(id)} style={{ flex: 1 }}>{name}</button>)}</div></fieldset>;
  return <section className="app-settings" role="dialog" aria-label="App settings" style={{ position: 'fixed', right: 0, top: 'var(--top-row-height)', bottom: 'var(--footer-height)', width: 'min(360px, 100vw)', zIndex: 100, background: 'var(--panel)', color: 'var(--text)', whiteSpace: 'normal', border: '1px solid var(--border)', boxShadow: '0 8px 24px #0003', display: 'flex', flexDirection: 'column' }}>
    <style>{`.app-settings button{font:inherit;color:var(--text);background:var(--raised);border:1px solid var(--border);border-radius:4px;min-height:24px;cursor:pointer}.app-settings button[aria-pressed="true"]{background:color-mix(in oklch,var(--accent) 17%,var(--panel));border-color:var(--accent)} .app-settings a{color:var(--accent)}`}</style><header style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}><div><strong>App settings</strong><div style={{ color: 'var(--text-muted)' }}>All panes · saved in this browser</div></div><button type="button" onClick={onClose} aria-label="Close settings">×</button></header>
    <div style={{ overflow: 'auto', padding: 12, flex: 1 }}>
      {section !== 'settings' && <button type="button" onClick={() => setSection('settings')}>← App settings</button>}
      {section === 'shortcuts' ? <><h3>Keyboard shortcuts</h3><ShortcutList /></> : section === 'about' ? <><h3>About Mergen Scope</h3><p>Version {APP_VERSION} · Apache-2.0</p><p><a href="https://github.com/AlpGoXd/mergen-scope" target="_blank" rel="noopener noreferrer">GitHub ↗</a></p><div style={{ display: 'grid', gap: 8 }}><FeedbackLinks /></div></> : <>
        <strong>Appearance</strong>
        {choice('Theme', preference, [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']] as const, setPreference)}
        {choice('Size', prefs.size, [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['large', 'Large']] as const, size => update({ ...prefs, size }))}
        {choice('Neutral colour', 'slate', [['slate', 'Slate']] as const, () => {})}
        <strong>Colours</strong>
        <fieldset style={{ border: 0, padding: 0, margin: '10px 0' }}><legend>Palette</legend>{(['standard', 'colour-blind'] as const).map(palette => <button type="button" key={palette} aria-pressed={prefs.palette === palette} onClick={() => update({ ...prefs, palette })} style={{ display: 'block', textAlign: 'left', width: '100%', padding: 8, marginBottom: 4 }}><strong>{palette === 'standard' ? 'Standard' : 'Colour-blind safe'}</strong><div style={{ color: 'var(--text-muted)', margin: '4px 0' }}>{palette === 'standard' ? 'The 8-colour wheel.' : 'The same wheel in a colour-blind-safe order.'}</div><span style={{ display: 'flex', gap: 3 }}>{(palette === 'standard' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 6, 1, 4, 3, 7, 5, 2]).map(index => <span key={index} style={{ background: `var(--tr${index})`, width: 22, height: 8, borderRadius: 2 }} />)}</span></button>)}</fieldset>
        {choice('Line styles', prefs.lineStyles, [['off', 'Off'], ['traces-5-8', 'Traces 5–8'], ['all', 'All']] as const, lineStyles => update({ ...prefs, lineStyles }))}
        <strong>Export</strong>
        {choice('Export theme', prefs.exportTheme, [['print', 'Print (white)'], ['dark', 'Dark'], ['app', 'As app']] as const, exportTheme => update({ ...prefs, exportTheme }))}
        <strong>Experimental</strong><label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={limit === 8} onChange={event => setExperimental(event.target.checked)} /> Allow more than 4 panes (up to 8)<br /><span style={{ color: 'var(--text-muted)' }}>Experimental, not recommended: panes get small and layouts beyond 4 are Rows and Columns.</span></label>
        <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}><button type="button" onClick={() => setSection('shortcuts')}>Keyboard shortcuts ›</button><button type="button" onClick={() => setSection('about')}>About Mergen Scope ›</button></div>
        <p style={{ color: 'var(--text-muted)' }}>Grid, markers, lines and Smith options are configured per pane using its sliders button.</p>
      </>}
    </div><footer style={{ borderTop: '1px solid var(--border)', padding: 12 }}><button type="button" onClick={() => { update(defaultAppPreferences); setPreference('system'); setExperimental(false); }}>Reset all to defaults</button></footer>
  </section>;
}


