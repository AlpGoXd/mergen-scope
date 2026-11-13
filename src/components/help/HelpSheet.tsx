import { useLayoutEffect, useRef } from 'react';
import { MOUSE_HINTS, SHORTCUTS } from '../../domain/shortcuts';
import { APP_VERSION, feedbackUrl } from './shortcuts';
import './help-sheet.css';

/** The two GitHub issue links; `menu` marks them as the items of a menu (the footer's Feedback menu). */
export function FeedbackLinks({ menu = false }: { menu?: boolean }) {
  const role = menu ? 'menuitem' : undefined;
  return <><a role={role} href={feedbackUrl('problem')} target="_blank" rel="noopener noreferrer">Report a problem ↗</a><a role={role} href={feedbackUrl('idea')} target="_blank" rel="noopener noreferrer">Suggest an idea ↗</a></>;
}

const PRIVACY = 'Your files never leave this browser.';

/** Key chips; alternatives separated by "/". */
function Keys({ keys }: { keys: readonly (readonly string[])[] }) {
  return <span className="help-keys">{keys.map((combo, index) => <span key={combo.join('+')} className="help-keys">
    {index > 0 ? <span className="help-keys__or t-caption">/</span> : null}
    {combo.map(key => <kbd key={key} className="kbd t-readout">{key}</kbd>)}
  </span>)}</span>;
}

function HelpList({ items, label }: { items: readonly { readonly keys: readonly (readonly string[])[]; readonly label: string; readonly id?: string }[]; label: string }) {
  return <dl className="help-list" aria-label={label}>{items.map(item => <div key={item.id ?? item.label} className="help-list__row" data-shortcut={item.id}>
    <dt><Keys keys={item.keys} /></dt><dd className="t-label">{item.label}</dd>
  </div>)}</dl>;
}

/**
 * Help: Mouse and Keyboard (both from src/domain/shortcuts.ts), anchored above the footer's "?" button.
 * `focus="keyboard"` (App settings › Keyboard shortcuts) opens it scrolled to the Keyboard section.
 */
export function HelpSheet({ onClose, onAbout, focus = 'top' }: { onClose: () => void; onAbout: () => void; focus?: 'top' | 'keyboard' }) {
  const body = useRef<HTMLDivElement>(null);
  const keyboard = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (focus === 'keyboard' && body.current && keyboard.current) body.current.scrollTop = keyboard.current.offsetTop - body.current.offsetTop;
  }, [focus]);
  return <section className="help-sheet" role="dialog" aria-label="Help" data-testid="help-sheet">
    <header className="help-sheet__head"><span className="t-title">Help</span><button type="button" className="help-close" onClick={onClose} aria-label="Close help">×</button></header>
    <div className="help-sheet__body" ref={body}>
      <section className="help-sheet__section" aria-labelledby="help-mouse"><h3 id="help-mouse" className="t-section">Mouse</h3><HelpList items={MOUSE_HINTS} label="Mouse" /></section>
      <section className="help-sheet__section" aria-labelledby="help-keyboard" ref={keyboard} data-testid="help-keyboard"><h3 id="help-keyboard" className="t-section">Keyboard</h3><HelpList items={SHORTCUTS} label="Keyboard" /></section>
    </div>
    <footer className="help-sheet__foot t-caption">
      <span>Mergen Scope {APP_VERSION}</span><span aria-hidden="true">·</span>
      <button type="button" className="help-link" onClick={onAbout}>About</button><span aria-hidden="true">·</span>
      <FeedbackLinks /><span aria-hidden="true">·</span>
      <span>{PRIVACY}</span>
    </footer>
  </section>;
}

/** About: name, version, licence, GitHub link and the privacy sentence. */
export function AboutPanel({ onClose }: { onClose: () => void }) {
  return <section className="about-panel" role="dialog" aria-label="About Mergen Scope" data-testid="about-panel">
    <header className="about-panel__head"><span className="t-title">About Mergen Scope</span><button type="button" className="help-close" onClick={onClose} aria-label="Close about">×</button></header>
    <div className="about-panel__body">
      <p className="t-label">Mergen Scope <span className="t-readout">{APP_VERSION}</span></p>
      <p className="t-label">Licence: Apache-2.0</p>
      <p className="t-label"><a href="https://github.com/AlpGoXd/mergen-scope" target="_blank" rel="noopener noreferrer">GitHub ↗</a></p>
      <p className="t-caption">{PRIVACY}</p>
    </div>
  </section>;
}
