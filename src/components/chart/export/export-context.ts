import { createContext, useContext } from 'react';

/** Props that turn ChartPane / SmithPaneContainer into an export render (no chrome, no interaction, fixed size). */
export interface ExportView {
  /** CSS px of the chart body (legend excluded). */
  readonly width: number;
  readonly height: number;
  /** Theme for trace colours (print uses the light palette). */
  readonly colorTheme: 'light' | 'dark';
  /** Print look: a black frame around the plot. */
  readonly print: boolean;
  /** Paper size: 8 pt text and 0.75 pt lines at final size. */
  readonly paper: boolean;
  /** Size of trace symbols, sample dots and marker glyphs relative to the screen (1 on screen and pane-size exports). */
  readonly markScale: number;
  /** Marker tag text size in CSS px (11 on screen). */
  readonly tagPx: number;
  /** Chart panes report what they drew: ranges and axis labels (Copy as LaTeX uses them). */
  readonly onPlot?: (info: ExportPlotInfo) => void;
}

export interface ExportPlotInfo {
  readonly x: readonly [number, number] | null;
  readonly y: readonly [number, number] | null;
  readonly xLabel: string;
  readonly xUnit: string | null;
  readonly yLabel: string;
}

export interface ExportNotice {
  readonly message: string;
  /** Set when the notice offers a download instead for this pane. */
  readonly paneId: string | null;
  /** What that download is: the PNG after a blocked image copy, the .tex after a blocked LaTeX copy. */
  readonly fallback?: 'image' | 'tex';
}

export interface PaneImageExport {
  copyImage: (paneId: string) => void;
  downloadImage: (paneId: string) => void;
  downloadSvg: (paneId: string) => void;
  copyLatex: (paneId: string) => void;
  downloadLatex: (paneId: string) => void;
  /** Why a pane cannot be exported in this format, or null when it can. */
  unavailable: (paneId: string, format: 'image' | 'latex') => string | null;
  /** Opens the small Options popover at an element or a point. */
  openOptions: (paneId: string, at?: HTMLElement | { x: number; y: number }) => void;
  notice: ExportNotice | null;
  dismissNotice: () => void;
}

export const PaneImageExportContext = createContext<PaneImageExport | null>(null);

export function usePaneImageExport(): PaneImageExport | null {
  return useContext(PaneImageExportContext);
}
