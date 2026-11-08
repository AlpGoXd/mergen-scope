import { useEffect, useState } from 'react';
import { useFileState } from '../../stores/file-store';
import { usePaneState } from '../../stores/pane-store';
import { useUiState } from '../../stores/ui-store';
import { useMarkerState } from '../../stores/marker-store';
import { useRefLineState } from '../../stores/ref-line-store';
import { useTraceState } from '../../stores/trace-store';
import { FeedbackLinks, HelpSheet } from '../help/HelpSheet';
import { SettingsSheet } from '../settings/SettingsSheet';

/** Optional display values are supplied by the pane integration when available. */
export interface FooterBarProps { cursor?: string; paneType?: 'chart' | 'smith' | 'table'; armedSentence?: string }
export function FooterBar({ cursor, paneType = 'chart', armedSentence }: FooterBarProps = {}) {
  const { files } = useFileState();
  const { activePaneId, paneActiveTraceMap, tracePaneMap } = usePaneState();
  const { selectedTraceName } = useUiState();
  const { armed } = useMarkerState();
  const { refMode } = useRefLineState();
  const { allTraces } = useTraceState();
  const [sheet, setSheet] = useState<'help' | 'settings' | 'about' | null>(null);
  const [feedback, setFeedback] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === 'Escape' && (sheet || feedback)) { event.preventDefault(); event.stopPropagation(); setSheet(null); setFeedback(false); }
      else if (!editing && event.ctrlKey && event.key === ',') { event.preventDefault(); setSheet('settings'); }
      else if (!editing && event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setSheet('help'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sheet, feedback]);
  const activeTraceName = (activePaneId ? paneActiveTraceMap[activePaneId] : null) ?? selectedTraceName ?? Object.entries(tracePaneMap).find(([, ids]) => ids.includes(activePaneId ?? ''))?.[0] ?? null;
  const traceLabel = activeTraceName ? (allTraces.find(t => t.name === activeTraceName)?.dn ?? activeTraceName) : 'none';
  const isArmed = !!armed || !!refMode;
  const sentence = armedSentence ?? (refMode ? `Click to place ${refMode === 'h' ? 'horizontal' : 'vertical'} line · Esc cancels` : armed ? `Click to place ${armed.kind === 'delta' ? 'delta marker' : 'marker'} · Esc cancels` : 'Click: select · drag: move');
  const hints = isArmed ? 'Click place · Esc cancel' : paneType === 'smith' ? 'Scroll zoom · Ctrl+drag pan · Double-click fit' : 'Right-drag X zoom · Scroll Y scale · Ctrl+drag pan · Double-click fit';
  return <footer className="footer-bar" style={{ position: 'relative', flexShrink: 0, height: 24, borderTop: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text-muted)', fontSize: 'var(--font-caption)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', whiteSpace: 'nowrap' }}>
    <style>{'.footer-bar button{font:inherit;color:var(--text-muted);background:transparent;border:1px solid transparent;border-radius:4px;cursor:pointer;padding:1px 4px}.footer-bar button:hover{background:var(--raised);border-color:var(--border)} .footer-bar a{color:var(--text)} @media(max-width:1279px){.footer-hints{display:none}} @media(max-width:999px){.footer-action-label{display:none}} @media(max-width:819px){.footer-trace{display:none}}'}</style>
    {files.length ? <><span style={isArmed ? { color: 'var(--text)', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' } : { color: 'var(--text)' }}>{sentence}</span><span>· Target <strong style={{ color: 'var(--text)' }}>Pane {activePaneId?.split('-')[1] ?? '—'}</strong></span><span className="footer-trace">· Trace <strong style={{ color: 'var(--text)' }} title={traceLabel}>{traceLabel.length > 16 ? `${traceLabel.slice(0, 15)}…` : traceLabel}</strong></span>{cursor && <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>· {cursor}</span>}</> : <span style={{ color: 'var(--text)' }}>No file open</span>}
    <span style={{ flex: 1 }} /><span className="footer-hints">{files.length ? hints : 'Drop files anywhere · Ctrl+O open'}</span>
    <span title="Your files are read in this browser; nothing is uploaded" aria-label="Local only">♢ <span className="footer-action-label">Local only</span></span>
    <button type="button" aria-expanded={feedback} onClick={() => { setFeedback(!feedback); setSheet(null); }} title="Feedback">▣ <span className="footer-action-label">Feedback</span></button>
    <button type="button" onClick={() => { setSheet(sheet === 'settings' ? null : 'settings'); setFeedback(false); }} title="Settings (Ctrl+,)" aria-label="Settings">⚙ <span className="footer-action-label">Settings</span></button>
    <button type="button" onClick={() => { setSheet(sheet === 'help' ? null : 'help'); setFeedback(false); }} title="Help (Shift+/)" aria-label="Help">?</button>
    {feedback && <div style={{ position: 'absolute', bottom: 24, right: 100, zIndex: 101, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 8px 24px #0003', padding: 10, whiteSpace: 'normal', width: 250, display: 'grid', gap: 8 }}><FeedbackLinks /><small>Needs a GitHub account. Adds the app version, browser and OS; never your files.</small></div>}
    {sheet === 'help' && <HelpSheet onClose={() => setSheet(null)} onAbout={() => setSheet('about')} />}
    {(sheet === 'settings' || sheet === 'about') && <SettingsSheet key={sheet} initialSection={sheet === 'about' ? 'about' : 'settings'} onClose={() => setSheet(null)} />}
  </footer>;
}

