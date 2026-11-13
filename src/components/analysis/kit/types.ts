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

/** A Math tool's created trace. It always follows its inputs and settings (no Live/Freeze toggle);
 *  "Freeze as a copy" lives in the card's ⋯ menu and makes an ordinary, independent trace. */
export interface MathOutput {
  hue: number;          // trace hue (the app's colour resolver may pass --trace instead)
  name: string;         // "S11 + S21" (updates when settings change)
  panes: string[];      // ["P1"]
}
/** Before a Math card has made its trace: nothing is created until the user presses the button. */
export interface CreateRowProps {
  label?: string;
  disabledReason?: string;
  /** The trace it will make, shown as an output row ("→ FFT · CH1") with the button at its end. */
  name?: string;
  /** Where the trace goes; defaults to under its input, in the same pane. */
  note?: string;
  onCreate: () => void;
}

export interface AnalysisCardProps {
  id: string;
  kind: AnalysisKind;
  title: string;                 // "Bandwidth"
  source?: string;               // "S21 · lna_board_rev3.s2p · Pane 1"
  /** Colour of the target trace: a swatch before the source text (R1). */
  sourceHue?: number;
  /** Measure tools with a chart overlay: the eye toggles it (R1). */
  overlay?: { on: boolean; onToggle: () => void };
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
  | { type: 'select'; value: string; title?: string; /** trace pickers: the trace colour */ hue?: number; onOpen: (anchor: HTMLElement) => void }
  | { type: 'segmented'; options: { value: string; label: string; disabledReason?: string }[]; value: string; onChange: (value: string) => void };

export interface ParamField { id: string; label: string; control: ParamControl }

/** One crossing. Only the value that changes is shown: for a V line every crossing has the line's x,
 *  so `value` is y ("−9.20 dB"); for an H line or a threshold level it is x ("2.398 12 GHz").
 *  The constant goes in the card's source line ("V1 · 3.653 32 GHz"), never in the rows. */
export interface CrossingRow {
  id: string;
  hue: number;
  trace: string;   // "S11" (short: the card source already names the file)
  value: string;
  current?: boolean;
}
export interface CrossingGroup { paneBadge: string; paneTitle: string; rows: CrossingRow[] }

export interface CrossingsListProps {
  groups: CrossingGroup[];
  /** Header of the value column: "Y" for a V line, "X" for an H line or a threshold. */
  valueLabel: string;
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
