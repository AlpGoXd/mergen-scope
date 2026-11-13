import React from 'react';
import { ToastProvider } from './toast-store';
import { AggregateWorkspaceProvider } from './aggregate-workspace-store';
import { SharedHoverProvider } from './shared-hover-store';
import { ShortcutProvider } from './shortcut-store';

export function StoreRoot({ children }: { children: React.ReactNode }) {
  return <ToastProvider><ShortcutProvider><SharedHoverProvider><AggregateWorkspaceProvider>{children}</AggregateWorkspaceProvider></SharedHoverProvider></ShortcutProvider></ToastProvider>;
}
