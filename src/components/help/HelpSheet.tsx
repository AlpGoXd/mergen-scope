
import { APP_VERSION, feedbackUrl, mouseShortcuts, shortcuts } from './shortcuts';

export function FeedbackLinks() {
  return <><a href={feedbackUrl('problem')} target="_blank" rel="noopener noreferrer">Report a problem ↗</a><a href={feedbackUrl('idea')} target="_blank" rel="noopener noreferrer">Suggest an idea ↗</a></>;
}
export function ShortcutList({ items = shortcuts }: { items?: readonly (readonly [string, string])[] }) {
  return <div>{items.map(([key, description]) => <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) 1fr', gap: 8, borderTop: '1px solid var(--border)', padding: '5px 0' }}><span><kbd>{key}</kbd></span><span>{description}</span></div>)}</div>;
}
export function HelpSheet({ onClose, onAbout }: { onClose: () => void; onAbout: () => void }) {
  return <section className="help-sheet" role="dialog" aria-label="Help and keyboard shortcuts" style={{ position: 'absolute', right: 4, bottom: 24, width: 'min(900px, calc(100vw - 16px))', maxHeight: 'calc(100vh - 60px)', overflow: 'auto', background: 'var(--panel)', color: 'var(--text)', whiteSpace: 'normal', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 8px 24px #0003', zIndex: 100, padding: 12 }}>
    <style>{`.help-sheet button{font:inherit;color:var(--text);background:var(--raised);border:1px solid var(--border);border-radius:4px;cursor:pointer}.help-sheet a{color:var(--accent)} .help-sheet kbd{font:var(--font-caption) var(--font-mono);background:var(--raised);border:1px solid var(--border);border-radius:3px;padding:1px 3px}`}</style><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Help</strong><button type="button" onClick={onClose} aria-label="Close help">×</button></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}><div style={{ flex: '1 1 300px' }}><h3>Mouse</h3><ShortcutList items={mouseShortcuts} /></div><div style={{ flex: '1 1 300px' }}><h3>Keyboard</h3><ShortcutList /></div></div>
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 8, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>Mergen Scope · {APP_VERSION} · <button type="button" onClick={onAbout}>About</button> · <FeedbackLinks /> · Your files never leave this browser.</div>
  </section>;
}

