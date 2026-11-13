import { useState } from 'react';
import { useFileState } from '../../stores/file-store';
import { usePaneState } from '../../stores/pane-store';
import { useUiState } from '../../stores/ui-store';
import { useMarkerState } from '../../stores/marker-store';
import { useRefLineState } from '../../stores/ref-line-store';
import { useTraceState } from '../../stores/trace-store';
import { AboutPanel, FeedbackLinks, HelpSheet } from '../help/HelpSheet';
import { useShortcut } from '../../stores/shortcut-store';
import { shortcutText } from '../../domain/shortcuts';
import { SettingsSheet } from '../settings/SettingsSheet';
import { useInteractionMode } from '../../hooks/use-interaction-mode';
import { PopoverAt } from '../shared/Controls';
import { paneName } from '../../domain/line-view';

/** Optional display values are supplied by the pane integration when available. */
export interface FooterBarProps { cursor?: string; paneType?: 'chart' | 'smith' | 'table'; armedSentence?: string }
export function FooterBar({ cursor, paneType = 'chart', armedSentence }: FooterBarProps = {}) {
  const { files } = useFileState();
  const { activePaneId, paneActiveTraceMap, tracePaneMap, panes } = usePaneState();
  const { selectedTraceName } = useUiState();
  const { armed } = useMarkerState();
  const { refMode } = useRefLineState();
  const { hint } = useInteractionMode();
  const { allTraces } = useTraceState();
  // 'help-keys' is Help scrolled to Keyboard (App settings › Keyboard shortcuts).
  const [sheet, setSheet] = useState<'help' | 'help-keys' | 'settings' | 'about' | null>(null);
  const [localOnly, setLocalOnly] = useState<HTMLElement | null>(null);
  const [feedback, setFeedback] = useState<HTMLElement | null>(null);
  const open = (next: typeof sheet) => { setSheet(next); setFeedback(null); setLocalOnly(null); };
  useShortcut('settings', () => open('settings'));
  useShortcut('help', () => open('help'));
  // Registered only while something is open, so it runs before the workspace's Esc (cancel placement).
  useShortcut('escape', () => open(null), sheet !== null || feedback !== null);
  const activeTraceName = (activePaneId ? paneActiveTraceMap[activePaneId] : null) ?? selectedTraceName ?? Object.entries(tracePaneMap).find(([, ids]) => ids.includes(activePaneId ?? ''))?.[0] ?? null;
  const traceLabel = activeTraceName ? (allTraces.find(t => t.name === activeTraceName)?.dn ?? activeTraceName) : 'none';
  const isArmed = !!armed || !!refMode;
  const sentence = armedSentence ?? (hint ? `${hint} · Esc cancels` : 'Click: select · drag: move');
  const hints = isArmed ? 'Click place · Esc cancel' : paneType === 'smith' ? 'Scroll zoom · Ctrl+drag pan · Double-click fit' : 'Right-drag X zoom · Scroll Y scale · Middle-click fit';
  return <footer className="footer-bar" style={{ position: 'relative', flexShrink: 0, height: 'var(--footer-height)', borderTop: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text-muted)', fontSize: 'var(--font-caption)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', whiteSpace: 'nowrap' }}>
    <style>{'.footer-bar button{font:inherit;color:var(--text-muted);background:transparent;border:1px solid transparent;border-radius:4px;cursor:pointer;padding:1px 4px}.footer-bar button:hover{background:var(--raised);border-color:var(--border)} .footer-bar a{color:var(--text)} @media(max-width:1279px){.footer-hints{display:none}} @media(max-width:999px){.footer-action-label{display:none}} @media(max-width:819px){.footer-trace{display:none}}'}</style>
    {files.length ? <><span style={isArmed ? { color: 'var(--text)', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' } : { color: 'var(--text)' }}>{sentence}</span><span>· Target <strong style={{ color: 'var(--text)' }}>{activePaneId ? paneName(panes, activePaneId) : '—'}</strong></span><span className="footer-trace">· Trace <strong style={{ color: 'var(--text)' }} title={traceLabel}>{traceLabel.length > 16 ? `${traceLabel.slice(0, 15)}…` : traceLabel}</strong></span>{cursor && <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>· {cursor}</span>}</> : <span style={{ color: 'var(--text)' }}>No file open</span>}
    <span style={{ flex: 1 }} /><span className="footer-hints">{files.length ? hints : 'Drop files anywhere · Ctrl+O open'}</span>
    <button type="button" aria-label="Local only" aria-expanded={localOnly !== null} onClick={event => { setLocalOnly(localOnly ? null : event.currentTarget); setFeedback(null); setSheet(null); }}>&#9826; <span className="footer-action-label">Local only</span></button>
    <button type="button" aria-expanded={feedback !== null} onClick={event => { setFeedback(feedback ? null : event.currentTarget); setSheet(null); }} title="Feedback">▣ <span className="footer-action-label">Feedback</span></button>
    <button type="button" onClick={() => open(sheet === 'settings' ? null : 'settings')} title={`App settings (${shortcutText('settings')})`} aria-label="Settings" aria-expanded={sheet === 'settings'}>⚙ <span className="footer-action-label">Settings</span></button>
    <button type="button" onClick={() => open(sheet === 'help' || sheet === 'help-keys' ? null : 'help')} title={`Help (${shortcutText('help')})`} aria-label="Help" aria-expanded={sheet === 'help' || sheet === 'help-keys'}>?</button>
    {localOnly && <PopoverAt label="Local only" at={localOnly} onClose={() => setLocalOnly(null)}><div className="t-caption" style={{ padding: 8, whiteSpace: 'normal', width: 250 }}>Your files are read in this browser and never uploaded. No cookies; settings are kept in this browser.</div></PopoverAt>}
    {feedback && <PopoverAt label="Feedback" at={feedback} onClose={() => setFeedback(null)}><div style={{ padding: 10, whiteSpace: 'normal', width: 250, display: 'grid', gap: 8 }}><FeedbackLinks /><small>Needs a GitHub account. Adds the app version, browser and OS; never your files.</small></div></PopoverAt>}
    {(sheet === 'help' || sheet === 'help-keys') && <HelpSheet key={sheet} focus={sheet === 'help-keys' ? 'keyboard' : 'top'} onClose={() => open(null)} onAbout={() => open('about')} />}
    {sheet === 'about' && <AboutPanel onClose={() => open(null)} />}
    {sheet === 'settings' && <SettingsSheet onClose={() => open(null)} onShowShortcuts={() => open('help-keys')} onAbout={() => open('about')} />}
  </footer>;
}

