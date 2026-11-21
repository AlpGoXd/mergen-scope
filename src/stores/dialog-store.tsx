import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Dialog } from '../components/shared/Controls';

/**
 * The app's own confirmation dialog, in place of window.confirm / window.prompt: centred, one solid confirm,
 * an optional secondary choice, Esc or Cancel cancels. `ask` resolves with what the user picked.
 */
export interface AskOptions {
  readonly title: string;
  /** What happens, in one or two sentences: say what will be lost. */
  readonly message: string;
  /** Optional list under the message (traces that move, what gets removed). */
  readonly details?: readonly string[];
  readonly confirmLabel: string;
  readonly secondaryLabel?: string;
  readonly danger?: boolean;
}
export type AskResult = 'confirm' | 'secondary' | 'cancel';
export type Ask = (options: AskOptions) => Promise<AskResult>;

const DialogContext = createContext<Ask | null>(null);
interface Pending { readonly id: number; readonly options: AskOptions; readonly resolve: (result: AskResult) => void }

export function DialogProvider({ children }: { children: React.ReactNode }) {
  // A queue, so two questions asked back to back are shown one after the other.
  const [queue, setQueue] = useState<readonly Pending[]>([]);
  const nextId = useRef(0);
  const ask = useCallback<Ask>(options => new Promise<AskResult>(resolve => { const id = ++nextId.current; setQueue(current => [...current, { id, options, resolve }]); }), []);
  const current = queue[0];
  const settle = (result: AskResult) => {
    if (!current) return;
    setQueue(items => items.slice(1));
    current.resolve(result);
  };
  const options = current?.options;
  return <DialogContext.Provider value={ask}>
    {children}
    {current && options && <Dialog key={current.id} open title={options.title} confirmLabel={options.confirmLabel} danger={options.danger ?? false}
      onConfirm={() => settle('confirm')} onClose={() => settle('cancel')}
      {...(options.secondaryLabel ? { secondary: { label: options.secondaryLabel, onClick: () => settle('secondary') } } : {})}>
      <div className="app-dialog__body" data-testid="app-dialog-body">
        <p className="t-label">{options.message}</p>
        {options.details?.length ? <ul className="app-dialog__details t-caption">{options.details.map(item => <li key={item}>{item}</li>)}</ul> : null}
      </div>
    </Dialog>}
  </DialogContext.Provider>;
}

/** `ask` from the nearest DialogProvider. Without one (isolated component tests) every question is cancelled. */
export function useAsk(): Ask {
  return useContext(DialogContext) ?? cancelAll;
}
const cancelAll: Ask = () => Promise.resolve('cancel');
