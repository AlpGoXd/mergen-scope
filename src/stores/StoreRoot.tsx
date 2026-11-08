import React from 'react';
import { ToastProvider } from './toast-store';
import { AggregateWorkspaceProvider } from './aggregate-workspace-store';

export function StoreRoot({ children }: { children: React.ReactNode }) {
  return <ToastProvider><AggregateWorkspaceProvider>{children}</AggregateWorkspaceProvider></ToastProvider>;
}
