import React from 'react';
import { ToastProvider } from './toast-store';
import { AggregateWorkspaceProvider } from './aggregate-workspace-store';
import { SharedHoverProvider } from './shared-hover-store';
import { ShortcutProvider } from './shortcut-store';
import { PointerReadoutProvider } from './pointer-readout-store';

export function StoreRoot({ children }: { children: React.ReactNode }) {
  return <ToastProvider><ShortcutProvider><SharedHoverProvider><PointerReadoutProvider><AggregateWorkspaceProvider>{children}</AggregateWorkspaceProvider></PointerReadoutProvider></SharedHoverProvider></ShortcutProvider></ToastProvider>;
}
