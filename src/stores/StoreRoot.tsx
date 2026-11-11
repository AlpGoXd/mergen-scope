import React from 'react';
import { ToastProvider } from './toast-store';
import { AggregateWorkspaceProvider } from './aggregate-workspace-store';
import { SharedHoverProvider } from './shared-hover-store';

export function StoreRoot({ children }: { children: React.ReactNode }) {
  return <ToastProvider><SharedHoverProvider><AggregateWorkspaceProvider>{children}</AggregateWorkspaceProvider></SharedHoverProvider></ToastProvider>;
}
