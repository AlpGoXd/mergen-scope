import type { DisplayTraceSourceRef } from './display';

declare module './workspace.ts' {
  interface WorkspaceScalarDisplayTrace {
    readonly source: DisplayTraceSourceRef;
  }

  interface WorkspaceComplexDisplayTrace {
    readonly source: DisplayTraceSourceRef;
  }
}

export {};
