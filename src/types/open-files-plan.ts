/** Pure opening decisions. IDs supplied here are opaque and must be unique. */
export interface OpenTrace {
  readonly id: string;
  /** Stable parameter/column identity, used to match a replacement. */
  readonly key: string;
}
export interface OpenMember { readonly trace: OpenTrace; readonly paneIds: readonly string[] }
export interface OpenFile {
  readonly id: string;
  readonly name: string;
  readonly members: readonly OpenMember[];
}
export interface OpenPane { readonly id: string; readonly renderMode?: 'cartesian' | 'smith' | 'smith-inverted' | 'table' }
export interface OpenState {
  /** Includes user-created panes, markers and other work even when no files are open. */
  readonly hasWork: boolean;
  readonly files: readonly OpenFile[];
  readonly panes: readonly OpenPane[];
  /** Includes hidden and pending traces, including traces not owned by files. */
  readonly members: readonly OpenMember[];
  readonly targetPaneId: string | null;
}
export type OpenData = {
  readonly kind: 'data'; readonly inputId: string; readonly name: string;
  readonly result: { readonly ok: false; readonly fileId: string; readonly reason: string } | {
    readonly ok: true; readonly fileId: string;
    /** On replacement, every still-available old parameter/view/column, including hidden and unplaced traces. */
    readonly replacementMatches?: readonly OpenTrace[];
    readonly selection:
      | { readonly kind: 'single'; readonly trace: OpenTrace }
      | { readonly kind: 'network'; readonly ports: number; readonly s11?: OpenTrace; readonly s21?: OpenTrace }
      | { readonly kind: 'columns'; readonly selected: readonly OpenTrace[]; readonly recognized: boolean };
  };
};
export type OpenInput = OpenData | {
  readonly kind: 'workspace'; readonly inputId: string; readonly name: string;
  readonly result: { readonly ok: false; readonly reason: string } | { readonly ok: true; readonly state: OpenState };
};
export type OpenChoice = 'cancel' | 'copy' | 'replace';
export interface OpenPlanContext {
  readonly revision: string | number;
  readonly state: OpenState;
  readonly paneLimit: 4 | 8;
  /** Includes all IDs issued in this session, even for panes since removed. */
  readonly issuedPaneIds: readonly string[];
  readonly explicitPaneId?: string;
  readonly workspaceChoice?: 'cancel' | 'replace';
  /** Cancel cancels the entire atomic batch, rather than skipping one file. */
  readonly duplicateChoices: Readonly<Record<string, OpenChoice | undefined>>;
  /** Called with complete provisional memberships, including hidden traces; the caller resolves trace IDs to parsed trace/capability data. */
  readonly canPlace: (trace: OpenTrace, pane: OpenPane, members: readonly OpenMember[]) => { readonly allowed: true } | { readonly allowed: false; readonly reason: string };
  /** Pure allocator: no external state changes; returns a fresh concrete ID and suitable pane, or null. */
  readonly newPane: (trace: OpenTrace, panes: readonly OpenPane[], issuedIds: readonly string[]) => OpenPane | null;
}
export type OpenStep =
  | { readonly kind: 'workspace'; readonly inputId: string }
  | { readonly kind: 'error'; readonly inputId: string; readonly fileId: string; readonly name: string; readonly reason: string; readonly replaceFileId?: string }
  | { readonly kind: 'new-pane'; readonly pane: OpenPane }
  | { readonly kind: 'file'; readonly inputId: string; readonly fileId: string; readonly name: string; readonly replaceFileId?: string; readonly matrixOpen: boolean; readonly traces: readonly { readonly trace: OpenTrace; readonly paneIds: readonly string[]; readonly preserveFrom?: OpenTrace; readonly unplacedReason?: string }[] };
export type OpenPlanResult =
  | { readonly ok: true; readonly revision: string | number; readonly steps: readonly OpenStep[] }
  | { readonly ok: false; readonly kind: 'refused' | 'decision' | 'cancelled'; readonly reason: string; readonly inputId?: string };
