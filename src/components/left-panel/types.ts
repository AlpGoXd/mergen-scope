import type { ReactNode } from 'react';
// Presentational props for the left-panel kit. No store types: the app maps its state onto these.

export type FileFormat = `S${number}P` | 'DAT' | 'CSV' | 'TXT';
export type MatrixFamily = 'S' | 'Y' | 'Z' | 'ABCD';
export type MatrixView = 'dB' | 'Mag' | 'Phase' | 'Re' | 'Im' | 'VSWR' | 'Return loss' | 'Group delay';
export type Interp = 'Auto' | 'Exact' | 'Lin' | 'Near' | 'Prev' | 'Next' | 'Cub' | 'Sinc';

/** A trace colour is a hue on the trace wheel (270, 0, 90, 180, 315, 45, 135, 225 …). */
export type Hue = number;

export interface MatrixCell {
  /** 1-based row and column, e.g. 2,1 for S21. */
  row: number;
  col: number;
  /** Plotted in the target pane in the current view: filled with the trace colour. */
  plotted?: { hue: Hue };
  /** Plotted in another view or another pane: small corner dot in the trace colour. */
  elsewhere?: { hue: Hue };
  /** Tooltip text, e.g. "S11 · dB is in Pane 1. Click to add it to Pane 2 (target)". */
  title: string;
}
export interface MatrixProps {
  plotAsDisabled?: boolean;
  grid?: ReactNode;
  quickControl?: ReactNode;
  moreControl?: ReactNode;
  ports: number;
  family: MatrixFamily;
  view: MatrixView;
  /** 2-port only; otherwise ABCD is disabled with "2-port only". */
  abcdAllowed: boolean;
  cells: MatrixCell[];
  /** Views under "More ▾" and whether each is allowed (VSWR / return loss: Sii only; S family only). */
  moreViews: { view: MatrixView; allowed: boolean; reason?: string }[];
  onFamily: (f: MatrixFamily) => void;
  onView: (v: MatrixView) => void;
  onMore: (anchor: HTMLElement) => void;
  onToggleCell: (row: number, col: number) => void;
  /** 3+ ports: quick picks. */
  onQuickPick?: (pick: 'allSii' | 'allSij' | 'lower' | 'clear') => void;
  /** > 8 ports: list picker instead of the grid. */
  list?: { plotted: { label: string; hue: Hue }[]; onAdd: () => void; onRemove: (label: string) => void; onOpenGrid: () => void };
}

export interface InfoProps {
  mode: 'table' | 'raw';
  fields: { key: string; value: string }[];
  raw: string;
  onMode: (m: 'table' | 'raw') => void;
  onCopy: () => void;
  onClose: () => void;
}

export type FileState = 'ready' | 'parsing' | 'error' | 'traceRemoved';

export interface FileRowProps {
  format: FileFormat;
  name: string;
  /** Hover text: full name + summary. */
  title: string;
  state: FileState;
  /** Mono summary under the row when the matrix is open, e.g. "2 ports · 201 pts · 10 kHz–8.5 GHz · 3 traces". */
  summary?: string;
  progressPct?: number;
  errorReason?: string;
  matrix?: { open: boolean; onToggle: () => void; props?: MatrixProps };
  columns?: { open: boolean; onToggle: () => void; items: { name: string; plotted: boolean; onToggle: () => void }[] };
  info?: InfoProps;
  onPlot?: () => void;
  onFix?: () => void;
  onMenu: (anchor: HTMLElement) => void;
  menuOpen?: boolean;
  menuControl?: ReactNode;
  editingName?: boolean;
  onCommitName?: (value: string) => void;
  onCancelName?: () => void;
  headerOnly?: boolean;
  onRemove: () => void;
}
export interface TraceRowProps {
  hue: Hue;
  color?: string;
  swatch?: ReactNode;
  interpControl?: ReactNode;
  panesControl?: ReactNode;
  actionsControl?: ReactNode;
  name: string;
  /** "S21 · dB" for network traces, the column name for CSV; omitted for single-trace files. */
  subline?: string;
  interp: Interp;
  /** Pane badges in layout order; empty = not in a pane. */
  panes: string[];
  visible: boolean;
  selected?: boolean;
  created?: boolean;
  child?: boolean;
  onVisible: (v: boolean) => void;
  onSelect: () => void;
  onInterp: (anchor: HTMLElement) => void;
  onPanes: (anchor: HTMLElement) => void;
  onRename: () => void;
  editingName?: boolean;
  onCommitName?: (value: string) => void;
  onCancelName?: () => void;
  onRemove: () => void;
}

export interface MarkerItemProps {
  label: string; // "M1", "D2"
  hue: Hue;
  color?: string;
  referenceControl?: ReactNode;
  /** Optional control after the trace name of a normal marker (the IP3 role menu). */
  roleControl?: ReactNode;
  /** Editable X text, already formatted: "2.437 00 GHz" or "+12.00 MHz" for deltas. */
  x: string;
  y: string;
  /** "lna_board_rev3.s2p · S21"; for a delta the reference is shown instead. */
  traceName: string;
  panes: string[];
  mode: 'snap' | 'interp';
  delta?: { from: string; fromHue: Hue; at: string; onChangeRef: (anchor: HTMLElement) => void };
  selected?: boolean;
  related?: boolean;
  /** Save the typed X. Return a message to refuse it; the marker then stays where it is. */
  onX: (text: string) => string | null | void;
  onSelect: () => void;
  onRemove: () => void;
}

