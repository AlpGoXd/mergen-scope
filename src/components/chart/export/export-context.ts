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
}

export interface ExportNotice {
  readonly message: string;
  /** Set when the notice offers "Download image" for this pane. */
  readonly paneId: string | null;
}

export interface PaneImageExport {
  copyImage: (paneId: string) => void;
  downloadImage: (paneId: string) => void;
  /** Opens the small Options popover at an element or a point. */
  openOptions: (paneId: string, at?: HTMLElement | { x: number; y: number }) => void;
  notice: ExportNotice | null;
  dismissNotice: () => void;
}

export const PaneImageExportContext = createContext<PaneImageExport | null>(null);

export function usePaneImageExport(): PaneImageExport | null {
  return useContext(PaneImageExportContext);
}
