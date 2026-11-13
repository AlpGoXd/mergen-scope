import { useLayoutEffect, useRef, useState } from 'react';
import { useFileState } from '../../stores/file-store';
import { usePaneState } from '../../stores/pane-store';
import { useUiState } from '../../stores/ui-store';
import { useMarkerState } from '../../stores/marker-store';
import { useRefLineState } from '../../stores/ref-line-store';
import { useTraceState } from '../../stores/trace-store';
import { usePointerReadout } from '../../stores/pointer-readout-store';
import { useShortcut } from '../../stores/shortcut-store';
import { AboutPanel, FeedbackLinks, HelpSheet } from '../help/HelpSheet';
import { SettingsSheet } from '../settings/SettingsSheet';
import { PopoverAt } from '../shared/Controls';
import { FooterIcon } from './footer-icons';
import { paneName } from '../../domain/line-view';
import { footerSentence, shortTraceName } from '../../domain/footer-state';
import { footerHints, shortcutText } from '../../domain/shortcuts';
import type { MouseContext } from '../../domain/shortcuts';
import './footer-bar.css';

const SEP = ' · ';
/** data-fit levels; footer-bar.css hides more at each: 1 = two hints, 2 = no hints, 3 = no button words, 4 = no trace name. */
const MAX_FIT = 4;

/** Pick the least-narrow level at which the row (and the state sentence in it) fits without clipping. */
function fitRow(row: HTMLElement, sentence: HTMLElement | null): void {
  const fits = () => row.scrollWidth <= row.clientWidth && (!sentence || sentence.scrollWidth <= sentence.clientWidth);
  let level = 0;
  row.dataset['fit'] = '0';
  while (level < MAX_FIT && !fits()) row.dataset['fit'] = String(++level);
}

/** The mouse position, from whichever pane the pointer is over. Its own component so a mouse move re-renders only this. */
function PointerReadout({ kind }: { kind: 'chart' | 'smith' }) {
  const text = usePointerReadout();
  return <span className="footer-readout-slot"><span className={`footer-sep t-caption${text ? '' : ' is-empty'}`} aria-hidden="true">{SEP}</span><span className="footer-readout t-readout" data-kind={kind} data-testid="footer-readout">{text ?? ''}</span></span>;
}

/**
 * The app footer: what a click does now · target pane · active trace · mouse position, then the mouse hints for
 * the target pane and four quiet buttons. One line; on narrow windows it drops items in a fixed order (see fitRow).
 */
export function FooterBar() {
  const { files } = useFileState();
  const { activePaneId, paneActiveTraceMap, tracePaneMap, panes } = usePaneState();
  const { selectedTraceName } = useUiState();
  const { armed, markers } = useMarkerState();
  const { refMode, refLines } = useRefLineState();
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

  const row = useRef<HTMLDivElement>(null);
  const sentenceRef = useRef<HTMLSpanElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  // After every render: re-fit, and watch each item so a font or Size change re-fits too.
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const fit = () => fitRow(el, sentenceRef.current);
    fit();
    observer.current?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(fit);
      observer.current.observe(el);
      for (const child of Array.from(el.children)) observer.current.observe(child);
    }
    void document.fonts?.ready.then(fit);
  });
  useLayoutEffect(() => () => observer.current?.disconnect(), []);

  const hasFile = files.length > 0;
  const targetPane = panes.find(pane => pane.id === activePaneId);
  const activeTraceName = (activePaneId ? paneActiveTraceMap[activePaneId] : null) ?? selectedTraceName ?? Object.entries(tracePaneMap).find(([, ids]) => ids.includes(activePaneId ?? ''))?.[0] ?? null;
  const activeTrace = activeTraceName ? allTraces.find(t => t.name === activeTraceName) : undefined;
  const traceLabel = activeTraceName ? (activeTrace?.dn ?? activeTraceName) : 'none';
  const sentence = hasFile ? footerSentence({ armed, refMode, markers, refLines }) : { text: 'No file open', tone: null };
  const paneKind = targetPane?.renderMode === 'table' ? 'table' : targetPane?.renderMode === 'smith' || targetPane?.renderMode === 'smith-inverted' ? 'smith' : 'chart';
  const context: MouseContext = !hasFile ? 'empty' : sentence.tone ? 'armed' : paneKind;
  const hints = footerHints(context);

  return <footer className="footer-bar">
    <div className="footer-row t-caption" ref={row} data-fit="0">
      <span className="footer-sentence t-caption" ref={sentenceRef} data-tone={sentence.tone ?? undefined} data-testid="footer-sentence">{sentence.text}</span>
      {hasFile && <>
        <span className="footer-item" data-testid="footer-target">{SEP}Target <strong>{activePaneId ? paneName(panes, activePaneId) : '—'}</strong></span>
        <span className="footer-item footer-trace" data-testid="footer-trace" title={traceLabel}>{SEP}Trace <span className="footer-action">{shortTraceName(traceLabel, activeTrace?.file)}</span></span>
        <PointerReadout kind={paneKind === 'smith' ? 'smith' : 'chart'} />
      </>}
      <span className="footer-spacer" />
      <span className="footer-hints" data-testid="footer-hints" data-context={context}>
        {hints.map((hint, index) => <span key={hint.action} className="footer-hint" data-i={index}><span className="footer-action">{hint.action}</span> {hint.effect}</span>)}
      </span>
      <span className="footer-actions">
        <button type="button" className="footer-btn t-caption" aria-label="Local only" title="Local only: your files are read in this browser and never uploaded" aria-expanded={localOnly !== null} onClick={event => { setLocalOnly(localOnly ? null : event.currentTarget); setFeedback(null); setSheet(null); }}><FooterIcon name="shield" /><span className="footer-word">Local only</span></button>
        <button type="button" className="footer-btn t-caption" aria-label="Feedback" title="Feedback: report a problem or suggest an idea on GitHub" aria-haspopup="menu" aria-expanded={feedback !== null} onClick={event => { setFeedback(feedback ? null : event.currentTarget); setLocalOnly(null); setSheet(null); }}><FooterIcon name="feedback" /><span className="footer-word">Feedback</span></button>
        <button type="button" className="footer-btn t-caption" aria-label="Settings" title={`App settings (${shortcutText('settings')})`} aria-expanded={sheet === 'settings'} onClick={() => open(sheet === 'settings' ? null : 'settings')}><FooterIcon name="settings" /><span className="footer-word">Settings</span></button>
        <button type="button" className="footer-btn t-caption" aria-label="Help" title={`Help (${shortcutText('help')})`} aria-expanded={sheet === 'help' || sheet === 'help-keys'} onClick={() => open(sheet === 'help' || sheet === 'help-keys' ? null : 'help')}><FooterIcon name="help" /></button>
      </span>
    </div>
    {localOnly && <PopoverAt label="Local only" at={localOnly} onClose={() => setLocalOnly(null)}><div className="footer-note t-caption" data-testid="footer-local-only">Your files are read in this browser and never uploaded. No cookies; settings are kept in this browser.</div></PopoverAt>}
    {feedback && <PopoverAt label="Feedback" at={feedback} onClose={() => setFeedback(null)}><div className="footer-feedback" role="menu" aria-label="Feedback" data-testid="footer-feedback"><FeedbackLinks menu /><span className="t-caption">Needs a GitHub account. Adds the app version, browser and OS; never your files.</span></div></PopoverAt>}
    {(sheet === 'help' || sheet === 'help-keys') && <HelpSheet key={sheet} focus={sheet === 'help-keys' ? 'keyboard' : 'top'} onClose={() => open(null)} onAbout={() => open('about')} />}
    {sheet === 'about' && <AboutPanel onClose={() => open(null)} />}
    {sheet === 'settings' && <SettingsSheet onClose={() => open(null)} onShowShortcuts={() => open('help-keys')} onAbout={() => open('about')} />}
  </footer>;
}
