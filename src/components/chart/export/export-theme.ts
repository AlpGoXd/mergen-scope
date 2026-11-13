import type { ExportTheme } from '../../../domain/export-image';
import { PAPER_TEXT_PT, ptToCssPx } from '../../../domain/export-image';

/** The look an exported image is drawn in: the App setting "As app" resolves to light or dark. */
export type ResolvedExportTheme = 'print' | 'light' | 'dark';

export function resolveExportTheme(choice: ExportTheme, appTheme: string): ResolvedExportTheme {
  if (choice === 'print') return 'print';
  if (choice === 'dark') return 'dark';
  return appTheme === 'dark' || appTheme === 'glass' ? 'dark' : 'light';
}

/** Trace colours follow the light palette on paper. */
export function colorThemeOf(theme: ResolvedExportTheme): 'light' | 'dark' {
  return theme === 'dark' ? 'dark' : 'light';
}

/**
 * The theme class the app puts on <html>. The export container carries it, so light and dark tokens come from
 * index.css itself (its token block also matches `.theme-light` / `.theme-dark`); print starts from light.
 */
export function exportThemeClass(theme: ResolvedExportTheme): 'theme-light' | 'theme-dark' {
  return theme === 'dark' ? 'theme-dark' : 'theme-light';
}

/** Print is the paper look, not an app theme: white background, black text and frame, light grey grid, no tints. */
const PRINT: Readonly<Record<string, string>> = {
  '--bg': '#ffffff', '--panel': '#ffffff', '--raised': '#ffffff', '--card': '#ffffff',
  '--text': '#000000', '--text-muted': '#333333', '--muted': '#000000', '--dim': '#555555',
  '--grid': '#c8c8c8', '--border': '#c8c8c8', '--border-strong': '#999999', '--accent': '#000000',
  '--tipBg': '#ffffff', '--tipBd': '#999999', '--refV': '#333333', '--refH': '#333333',
};

export const SCREEN_FONT_PX = 12;
export const PAPER_FONT_PX = ptToCssPx(PAPER_TEXT_PT);
const SANS = '"IBM Plex Sans", sans-serif';
const MONO = '"JetBrains Mono", monospace';
const SERIF = '"Times New Roman", Times, serif';

export function exportFontFamily(paper: boolean): string {
  return paper ? SERIF : SANS;
}

/** Inline tokens on top of the theme class: print colours (print only) and the export's fixed fonts. */
export function exportTokens(theme: ResolvedExportTheme, paper: boolean): Record<string, string> {
  const font = paper ? PAPER_FONT_PX : SCREEN_FONT_PX;
  return {
    ...(theme === 'print' ? PRINT : {}),
    '--font-sans': paper ? SERIF : SANS,
    '--font-mono': paper ? SERIF : MONO,
    '--font-label': `${font}px`,
    '--font-caption': `${paper ? font : font - 1}px`,
    '--font-title': `${paper ? font : font + 2}px`,
  };
}
