// Presentational props for the Lines kit (board P4c). No stores and no geometry maths: the app
// converts values to pixels (Recharts scales) and formats every number (formatEng, real minus).
import type { MouseEvent, PointerEvent } from 'react';

export type LineKind = 'v' | 'h';

export interface LineRowProps {
  label: string;                 // "V1", "H1"
  kind: LineKind;
  value: string;                 // "2.400 00 GHz", shown in the input
  /** Pane badges in layout order ("P1", "P2"); empty = not in a pane. */
  panes: string[];
  /** e.g. "3 crossings". Leave undefined while there is nothing to count. */
  crossings?: string;
  /** Panes where the value is outside the visible range, e.g. ["P1"]. */
  offView?: string[];
  /** Hover or selection of any copy on a chart lights the row too. */
  lit?: boolean;
  selected?: boolean;
  invalid?: boolean;
  menuOpen?: boolean;
  onValue: (text: string) => void;
  /** Opens "Show in" (V lines). H lines have one pane, so the badge only shows a tooltip. */
  onPanes: (anchor: HTMLElement) => void;
  onListCrossings: () => void;
  onRemove: () => void;
  onHover?: (hovering: boolean) => void;
}

export interface ChartLineProps {
  kind: LineKind;
  /** Pixel position inside the plot: x for a V line, y for an H line. */
  at: number;
  /** Plot rectangle in pixels. */
  plot: { left: number; top: number; width: number; height: number };
  label: string;               // "V1"
  /** How many panes show this line; > 1 adds " · n" to the label. */
  paneCount: number;
  lit?: boolean;
  selected?: boolean;
  onHover?: (hovering: boolean) => void;
  onPointerDown?: (e: PointerEvent<SVGGElement>) => void;
  onContextMenu?: (e: MouseEvent<SVGGElement>) => void;
  onLabelClick?: () => void;
}

export interface CrossingDotProps { x: number; y: number; hue: number; current?: boolean }

export type EdgeSide = 'left' | 'right' | 'top' | 'bottom';
export interface EdgeTagProps {
  side: EdgeSide;
  /** For left/right: top in px (tag centre). For top/bottom: left in px (tag centre). */
  offset: number;
  label: string;               // "V1"
  value: string;               // "2.400 GHz"
  lit?: boolean;
  onReveal: () => void;        // pan this pane to the line
  onHover?: (hovering: boolean) => void;
}

export interface ShowInPane { id: string; label: string; checked: boolean; disabledReason?: string; aside?: string }
