import { useLayoutEffect, useRef } from 'react';
import { MOUSE_HINTS, SHORTCUTS } from '../../domain/shortcuts';
import { APP_VERSION } from './shortcuts';
import './help-sheet.css';
import { useSheetFocus } from '../../hooks/use-sheet-focus';
import { useCenteredDialog } from '../../hooks/use-centered-dialog';
import { CloseIcon } from '../shared/Icons';

/** Feedback destinations shared by the footer menu, the Help sheet and About. */
export function FeedbackLinks({ menu = false }: { menu?: boolean }) {
  const role = menu ? 'menuitem' : undefined;
  return <><a role={role} href="https://github.com/AlpGoXd/mergen-scope/issues/new/choose" target="_blank" rel="noopener noreferrer">Report a problem ↗</a><a role={role} href="https://github.com/AlpGoXd/mergen-scope/discussions" target="_blank" rel="noopener noreferrer">Suggest an idea ↗</a><a role={role} href="https://tally.so/r/jeoN9x" target="_blank" rel="noopener noreferrer">Feedback without a GitHub account ↗</a></>;
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
 * Help: Mouse and Keyboard (both from src/domain/shortcuts.ts).
 * `focus="keyboard"` (App settings › Keyboard shortcuts) opens it scrolled to the Keyboard section.
 */
export function HelpSheet({ onClose, onAbout, focus = 'top' }: { onClose: () => void; onAbout: () => void; focus?: 'top' | 'keyboard' }) {
  const dialog = useSheetFocus();
  const body = useRef<HTMLDivElement>(null);
  const keyboard = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (focus === 'keyboard' && body.current && keyboard.current) body.current.scrollTop = keyboard.current.offsetTop - body.current.offsetTop;
  }, [focus]);
  return <div ref={dialog} className="help-sheet" role="dialog" aria-label="Help" data-testid="help-sheet" tabIndex={-1}>
    <header className="help-sheet__head"><span className="t-title">Help</span><button type="button" className="help-close" onClick={onClose} aria-label="Close help"><CloseIcon /></button></header>
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
  </div>;
}

/** About: name, version, licence, GitHub link, the feedback links and the privacy sentence. */
export function AboutPanel({ onClose }: { onClose: () => void }) {
  const dialog = useCenteredDialog();
  return <dialog ref={dialog} className="ui-dialog about-panel" role="dialog" aria-modal="true" aria-label="About Mergen Scope" data-testid="about-panel" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="about-panel__head"><span className="t-title">About Mergen Scope</span><button type="button" className="help-close" onClick={onClose} aria-label="Close about"><CloseIcon /></button></header>
    <div className="about-panel__body">
      <p className="t-label">Mergen Scope <span className="t-readout">{APP_VERSION}</span></p>
      <p className="t-label">Licence: Apache-2.0</p>
      <p className="t-label"><a href="https://github.com/AlpGoXd/mergen-scope" target="_blank" rel="noopener noreferrer">GitHub ↗</a></p>
      <p className="t-label about-panel__links"><FeedbackLinks /></p>
      <p className="t-caption">{PRIVACY}</p>
    </div>
  </dialog>;
}
