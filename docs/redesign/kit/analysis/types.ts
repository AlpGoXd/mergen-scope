// Presentational props for the Analysis kit. No stores, no math: the app formats every number
// (formatEng, real minus, units) and passes strings in. Callbacks carry no events unless a
// popover needs an anchor element.
import type { ReactNode } from 'react';

/** Math makes a trace (ƒ); Measure reads numbers off a trace (ruler). */
export type AnalysisKind = 'math' | 'measure';

export interface KeyValue { label: string; value: string; title?: string }

export interface ResultValue {
  value: string;      // "86.2"
  unit?: string;      // "MHz"
  note?: string;      // "centre 2.441 GHz · 2.398 → 2.484 GHz"
}

export type CardMessageTone = 'warning' | 'danger' | 'info';
export interface CardMessage { tone: CardMessageTone; text: string; action?: { label: string; onClick: () => void } }

export interface MathOutput {
  hue: number;          // trace hue (the app's colour resolver may pass --trace instead)
  name: string;         // "smoothed · SG 7"
  panes: string[];      // ["P1"]
  live: boolean;        // Live follows the source; Freeze keeps the current samples
  onLive: (live: boolean) => void;
}

export interface AnalysisCardProps {
  id: string;
  kind: AnalysisKind;
  title: string;                 // "Bandwidth"
  source?: string;               // "S21 · lna_board_rev3.s2p · Pane 1"
  collapsed?: boolean;
  /** Shown in the header when collapsed, e.g. "86.2 MHz". */
  summary?: string;
  selected?: boolean;
  menuOpen?: boolean;
  onToggle?: () => void;
  onMenu?: (anchor: HTMLElement) => void;
  onRemove?: () => void;
  children?: ReactNode;
}

export type ParamControl =
  | { type: 'number'; value: string; unit?: string; invalid?: boolean; placeholder?: string; onCommit: (text: string) => void }
  | { type: 'select'; value: string; title?: string; onOpen: (anchor: HTMLElement) => void }
  | { type: 'segmented'; options: { value: string; label: string; disabledReason?: string }[]; value: string; onChange: (value: string) => void };

export interface ParamField { id: string; label: string; control: ParamControl }

export interface CrossingRow {
  id: string;
  hue: number;
  trace: string;   // "lna_board_rev3.s2p · S21"
  x: string;       // "2.398 12 GHz"
  y: string;       // "−3.00 dB"
  current?: boolean;
}
export interface CrossingGroup { paneBadge: string; paneTitle: string; rows: CrossingRow[] }

export interface CrossingsListProps {
  groups: CrossingGroup[];
  /** "Showing 200 of 1 834" when the list is capped. */
  capNote?: string;
  emptyText?: string;
  onSelect: (rowId: string) => void;
  onCopy?: () => void;
}

export interface AddMenuItem {
  id: string;
  kind: AnalysisKind;
  title: string;
  note: string;             // one-line description
  disabledReason?: string;  // replaces the note and greys the item, e.g. "needs a dBm/Hz trace"
  added?: boolean;          // already in the panel (✓)
}
export type AddMenuFilter = 'all' | 'math' | 'measure';
export interface AddAnalysisMenuProps {
  query: string;
  filter: AddMenuFilter;
  /** Optional "Recent" group shown above the A–Z list when the query is empty. */
  recent?: AddMenuItem[];
  items: AddMenuItem[];
  activeId?: string;
  onQuery: (q: string) => void;
  onFilter: (f: AddMenuFilter) => void;
  onPick: (id: string) => void;
}
