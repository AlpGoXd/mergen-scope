import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Btn } from './Btn';
import type { GroupTone } from './Btn';

export function Icon({ name, label }: { name: 'close' | 'check' | 'info' | 'warning' | 'error' | 'chevron' | 'more'; label?: string }) {
  const paths: Record<typeof name, React.ReactNode> = {
    close: <path d="M4 4l8 8M12 4l-8 8" />, check: <path d="M3 8l3 3 7-7" />, info: <><circle cx="8" cy="8" r="6" /><path d="M8 7v4M8 4.5v.5" /></>, warning: <><path d="M8 2l6 11H2L8 2zM8 6v3M8 11v.2" /></>, error: <><circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" /></>, chevron: <path d="M4 6l4 4 4-4" />, more: <><circle cx="3.5" cy="8" r="0.6" /><circle cx="8" cy="8" r="0.6" /><circle cx="12.5" cy="8" r="0.6" /></>,
  };
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{paths[name]}</svg>;
}

export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const id = useId(); const [dismissed, setDismissed] = useState(false); const [active, setActive] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null); const tip = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!active || dismissed || !anchor.current || !tip.current) return; const position = () => { if (anchor.current && tip.current) placePopup(anchor.current, tip.current); }; position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true); return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); }; }, [active, dismissed]);
  const disabled = React.isValidElement<{ disabled?: boolean }>(children) && children.props.disabled;
  const content = !disabled && React.isValidElement<{ "aria-describedby"?: string }>(children) ? React.cloneElement(children, { "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" ") }) : children;
  const tooltip = <span ref={tip} className="ui-tooltip" role="tooltip" id={id} hidden={dismissed} style={{ visibility: active ? 'visible' : 'hidden' }}>{text}</span>;
  return <span ref={anchor} className="ui-tooltip-anchor" tabIndex={disabled ? 0 : undefined} aria-describedby={disabled ? id : undefined} onMouseEnter={() => { setActive(true); setDismissed(false); }} onMouseLeave={() => setActive(false)} onFocus={() => { setActive(true); setDismissed(false); }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setActive(false); }} onKeyDown={e => { if (e.key === 'Escape' && !dismissed) { setDismissed(true); e.stopPropagation(); } }}>{content}{disabled ? tooltip : createPortal(tooltip, document.body)}</span>;
}

export function Select(props: React.ComponentPropsWithoutRef<'select'> & { reason?: string }) {
  const { reason, disabled, className = '', ...rest } = props;
  const select = <select className={`ui-select ${className}`} disabled={disabled} {...rest} />;
  return disabled && reason ? <Tooltip text={reason}>{select}</Tooltip> : select;
}

export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: string; disabled?: boolean; reason?: string }[]; value: T; onChange: (value: T) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  function keys(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)) return;
    e.preventDefault(); const enabled = options.filter(o => !o.disabled); if (!enabled.length) return;
    const index = enabled.findIndex(o => o.value === value); const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : (index + delta + enabled.length) % enabled.length;
    const option = enabled[next]; if (option) { onChange(option.value); ref.current?.querySelector<HTMLButtonElement>(`[data-option-index="${options.indexOf(option)}"]`)?.focus(); }
  }
  return <div ref={ref} role="radiogroup" aria-label={label} className="ui-segmented" onKeyDown={keys}>{options.map((option, index) => { const button = <Btn role="radio" data-option-index={index} variant="slate" active={option.value === value} disabled={option.disabled} aria-checked={option.value === value} tabIndex={option.value === value ? 0 : -1} onClick={() => onChange(option.value)}>{option.label}</Btn>; return <React.Fragment key={option.value}>{option.disabled && option.reason ? <Tooltip text={option.reason}>{button}</Tooltip> : button}</React.Fragment>; })}</div>;
}

export interface MenuItem { label: string; onSelect: () => void; disabled?: boolean; reason?: string }
function tabbables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter(el => {
    if (!el.matches('button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]') || el.tabIndex < 0 || el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) { const style = getComputedStyle(node); if (style.display === 'none' || style.visibility === 'hidden') return false; }
    return true;
  });
}
function placePopup(anchor: HTMLElement, popup: HTMLElement) {
  const a = anchor.getBoundingClientRect();
  popup.style.maxWidth = `${Math.max(0, window.innerWidth - 8)}px`; popup.style.maxHeight = `${Math.max(0, window.innerHeight - 8)}px`; const p = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(4, Math.min(a.left, window.innerWidth - p.width - 4))}px`;
  const preferredY = a.bottom + p.height + 4 <= window.innerHeight ? a.bottom + 4 : a.top - p.height - 4;
  popup.style.top = `${Math.max(4, Math.min(preferredY, window.innerHeight - p.height - 4))}px`;
}
export function Menu({ label, items, iconOnly = false, icon = 'chevron', className = '' }: { label: string; items: readonly MenuItem[]; iconOnly?: boolean; icon?: 'chevron' | 'more'; className?: string }) {
  const [open, setOpen] = useState(false); const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null); const popup = useRef<HTMLDivElement>(null); const focusLast = useRef(false);
  useEffect(() => { if (!open || !popup.current || !trigger.current) return; const position = () => { if (trigger.current && popup.current) placePopup(trigger.current, popup.current); }; position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true); const buttons = popup.current.querySelectorAll<HTMLButtonElement>('[role=menuitem]'); (focusLast.current ? buttons[buttons.length - 1] : buttons[0])?.focus({ preventScroll: true }); const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', close); return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); }; }, [open]);
  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); focusLast.current = e.key === 'ArrowUp'; setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); const anchor = trigger.current; const dialog = anchor?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]'); const all = tabbables(dialog ?? document).filter(el => !popup.current?.contains(el)); const index = anchor ? all.indexOf(anchor) : -1; const offset = e.shiftKey ? -1 : 1; const nextIndex = dialog && all.length ? (index + offset + all.length) % all.length : index + offset; const next = all[nextIndex]; setOpen(false); (next ?? anchor)?.focus(); }
    else if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) { e.preventDefault(); const els = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []); if (!els.length) return; const i = els.indexOf(document.activeElement as HTMLButtonElement); const next = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length; els[next]?.focus(); }
  }
  return <div className="ui-menu-root" ref={root} onKeyDown={onKeyDown}><button ref={trigger} type="button" className={`ui-btn ui-btn--neutral ${className}`.trim()} aria-haspopup="menu" aria-label={iconOnly ? label : undefined} aria-expanded={open} onClick={() => { focusLast.current = false; setOpen(!open); }}>{!iconOnly && label}<Icon name={icon} /></button>{open && createPortal(<div ref={popup} role="menu" className="ui-popover">{items.map(item => { const button = <button type="button" role="menuitem" tabIndex={-1} aria-disabled={item.disabled || undefined} onClick={() => { if (item.disabled) return; setOpen(false); item.onSelect(); trigger.current?.focus(); }}>{item.label}</button>; return <React.Fragment key={item.label}>{item.disabled && item.reason ? <Tooltip text={item.reason}>{button}</Tooltip> : button}</React.Fragment>; })}</div>, document.body)}</div>;
}
export function SplitButton({ label, onClick, items }: { label: string; onClick: () => void; items: readonly MenuItem[] }) { return <div className="ui-split"><Btn onClick={onClick}>{label}</Btn><Menu label={`More ${label} options`} items={items} iconOnly /></div>; }
export function Popover({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLButtonElement>(null); const root = useRef<HTMLDivElement>(null); const popup = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open || !ref.current || !popup.current) return; const position = () => { if (ref.current && popup.current) placePopup(ref.current, popup.current); }; position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true); const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', close); return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); }; }, [open]);
  return <div ref={root} className="ui-menu-root" onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); ref.current?.focus(); } }}><button type="button" ref={ref} className="ui-btn ui-btn--neutral" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>{open && createPortal(<div ref={popup} className="ui-popover">{children}</div>, document.body)}</div>;
}
/**
 * Controlled popup at an anchor element or a pointer position (context menus, badge menus).
 * Same surface, positioning and dismissal as Popover: outside press, Escape, resize and scroll close it.
 */
export function PopoverAt({ label, at, onClose, children }: { label: string; at: HTMLElement | { x: number; y: number }; onClose: () => void; children: React.ReactNode }) {
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = popup.current; if (!el) return;
    el.style.maxWidth = `${Math.max(0, window.innerWidth - 8)}px`; el.style.maxHeight = `${Math.max(0, window.innerHeight - 8)}px`;
    if (at instanceof HTMLElement) { placePopup(at, el); }
    else {
      const p = el.getBoundingClientRect();
      el.style.left = `${Math.max(4, Math.min(at.x, window.innerWidth - p.width - 4))}px`;
      el.style.top = `${Math.max(4, Math.min(at.y, window.innerHeight - p.height - 4))}px`;
    }
    el.querySelector<HTMLElement>('[role^=menuitem]:not([aria-disabled=true])')?.focus({ preventScroll: true });
  }, [at]);
  useEffect(() => {
    const press = (e: PointerEvent) => { if (!popup.current?.contains(e.target as Node) && !(at instanceof HTMLElement && at.contains(e.target as Node))) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', press, true); document.addEventListener('keydown', key, true);
    // An anchored popup follows its anchor; a pointer-placed one closes when the page moves under it.
    const move = (e: Event) => {
      if (popup.current?.contains(e.target as Node)) return;
      if (at instanceof HTMLElement && popup.current) placePopup(at, popup.current); else onClose();
    };
    window.addEventListener('resize', move); window.addEventListener('scroll', move, true);
    return () => { document.removeEventListener('pointerdown', press, true); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', move); window.removeEventListener('scroll', move, true); };
  }, [onClose, at]);
  return createPortal(<div ref={popup} className="ui-popover" role="presentation" aria-label={label} onClick={event => event.stopPropagation()}>{children}</div>, document.body);
}
export function MessageBar({ status, children }: { status: 'danger' | 'warning' | 'success' | 'info'; children: React.ReactNode }) { const icon = status === 'danger' ? 'error' : status === 'success' ? 'check' : status; return <div className={`ui-message ui-message--${status}`} role={status === 'danger' ? 'alert' : 'status'}><Icon name={icon} /><span>{children}</span></div>; }

export function Dialog({ open, title, children, confirmLabel, onConfirm, onClose, secondary, danger = false }: { open: boolean; title: string; children: React.ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; secondary?: { label: string; onClick: () => void }; danger?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = () => tabbables(ref.current ?? document)[0] ?? ref.current;
    first()?.focus();
    const guardFocus = (e: FocusEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) first()?.focus(); };
    const guardPointer = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { e.preventDefault(); e.stopPropagation(); } };
    document.addEventListener('focusin', guardFocus, true); document.addEventListener('pointerdown', guardPointer, true); document.addEventListener('click', guardPointer, true);
    return () => { document.removeEventListener('focusin', guardFocus, true); document.removeEventListener('pointerdown', guardPointer, true); document.removeEventListener('click', guardPointer, true); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return <div className="ui-dialog-backdrop"><div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref} onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose(); } else if (e.key === 'Enter' && !e.defaultPrevented && !e.nativeEvent.isComposing && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLElement && e.target.isContentEditable)) { e.preventDefault(); onConfirm(); } else if (e.key === 'Tab') { const nodes = ref.current ? tabbables(ref.current) : []; if (!nodes.length) { e.preventDefault(); return; } const first = nodes[0]; const last = nodes[nodes.length - 1]; if (e.shiftKey && e.target === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && e.target === last) { e.preventDefault(); first?.focus(); } } }}><h2 id={titleId}>{title}</h2><div>{children}</div><div className="ui-dialog-actions"><Btn onClick={onClose}>Cancel</Btn>{secondary && <Btn variant="secondary" onClick={secondary.onClick}>{secondary.label}</Btn>}<Btn variant="solid" danger={danger} onClick={onConfirm}>{confirmLabel}</Btn></div></div></div>;
}
export type { GroupTone };
