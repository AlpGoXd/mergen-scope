import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Btn } from '../components/shared/Btn';
import { Icon } from '../components/shared/Controls';

export interface ToastInput { message: string; kind?: 'info' | 'error'; undo?: () => void }
interface Toast extends ToastInput { id: number }
interface ToastContextValue { show: (toast: ToastInput) => void }
const ToastContext = createContext<ToastContextValue | null>(null);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]); const next = useRef(0);
  const show = useCallback((toast: ToastInput) => setToasts(current => [...current, { ...toast, id: ++next.current }]), []);
  const dismiss = useCallback((id: number) => setToasts(current => current.filter(t => t.id !== id)), []);
  return <ToastContext.Provider value={{ show }}>{children}<div className="ui-toast-host" aria-live="polite" aria-relevant="additions">{toasts.map(toast => <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />)}</div></ToastContext.Provider>;
}
function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false); const [focused, setFocused] = useState(false); const paused = hovered || focused; const remaining = useRef(5000);
  React.useEffect(() => { if (paused || toast.kind === 'error') return; const start = Date.now(); const timer = window.setTimeout(() => dismiss(toast.id), remaining.current); return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - start)); }; }, [paused, toast.id, toast.kind, dismiss]);
  return <div className="ui-toast" role={toast.kind === 'error' ? 'alert' : undefined} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}><span>{toast.message}</span>{toast.undo && <Btn onClick={() => { toast.undo?.(); dismiss(toast.id); }}>Undo</Btn>}<button type="button" className="ui-toast-close" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}><Icon name="close" /></button></div>;
}
export function useOptionalToast() { return useContext(ToastContext); }
export function useToast() { const context = useContext(ToastContext); if (!context) throw new Error('useToast must be used within ToastProvider'); return context; }
