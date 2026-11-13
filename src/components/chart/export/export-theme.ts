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
 * Tokens set on the export container only. Values are literal (copied from index.css :root and .theme-dark):
 * custom properties inherit as computed values, so an alias like `--card: var(--panel)` would keep the app theme.
 */
const COLORS: Readonly<Record<ResolvedExportTheme, Readonly<Record<string, string>>>> = {
  light: {
    '--bg': 'oklch(0.985 0.006 255)', '--panel': 'oklch(0.965 0.010 255)', '--raised': 'oklch(0.997 0.003 255)', '--card': 'oklch(0.965 0.010 255)',
    '--text': 'oklch(0.22 0.015 255)', '--text-muted': 'oklch(0.50 0.010 255)', '--muted': 'oklch(0.50 0.010 255)', '--dim': 'oklch(0.50 0.010 255)',
    '--grid': 'oklch(0.78 0.010 255)', '--border': 'oklch(0.90 0.010 255)', '--border-strong': 'oklch(0.78 0.010 255)', '--accent': 'oklch(0.50 0.1399 255)',
    '--tipBg': 'oklch(0.997 0.003 255)', '--tipBd': 'oklch(0.78 0.010 255)', '--refV': 'oklch(0.50 0.010 255)', '--refH': 'oklch(0.50 0.010 255)', '--cross': 'oklch(0.50 0.1399 255 / 0.6)',
  },
  dark: {
    '--bg': 'oklch(0.17 0.016 255)', '--panel': 'oklch(0.20 0.016 255)', '--raised': 'oklch(0.24 0.016 255)', '--card': 'oklch(0.20 0.016 255)',
    '--text': 'oklch(0.93 0.010 255)', '--text-muted': 'oklch(0.72 0.016 255)', '--muted': 'oklch(0.72 0.016 255)', '--dim': 'oklch(0.72 0.016 255)',
    '--grid': 'oklch(0.42 0.016 255)', '--border': 'oklch(0.31 0.016 255)', '--border-strong': 'oklch(0.42 0.016 255)', '--accent': 'oklch(0.78 0.1129 255)',
    '--tipBg': 'oklch(0.24 0.016 255)', '--tipBd': 'oklch(0.42 0.016 255)', '--refV': 'oklch(0.72 0.016 255)', '--refH': 'oklch(0.72 0.016 255)', '--cross': 'oklch(0.78 0.1129 255 / 0.6)',
  },
  // Paper look: white background, black frame and text, light grey grid, no UI tints.
  print: {
    '--bg': '#ffffff', '--panel': '#ffffff', '--raised': '#ffffff', '--card': '#ffffff',
    '--text': '#000000', '--text-muted': '#333333', '--muted': '#000000', '--dim': '#555555',
    '--grid': '#c8c8c8', '--border': '#c8c8c8', '--border-strong': '#999999', '--accent': '#000000',
    '--tipBg': '#ffffff', '--tipBd': '#999999', '--refV': '#333333', '--refH': '#333333', '--cross': 'rgba(0, 0, 0, 0.6)',
  },
};

export const SCREEN_FONT_PX = 12;
export const PAPER_FONT_PX = ptToCssPx(PAPER_TEXT_PT);
const SANS = '"IBM Plex Sans", sans-serif';
const MONO = '"JetBrains Mono", monospace';
const SERIF = '"Times New Roman", Times, serif';

export function exportFontFamily(paper: boolean): string {
  return paper ? SERIF : SANS;
}

export function exportTokens(theme: ResolvedExportTheme, paper: boolean): Record<string, string> {
  const font = paper ? PAPER_FONT_PX : SCREEN_FONT_PX;
  return {
    ...COLORS[theme],
    '--font-sans': paper ? SERIF : SANS,
    '--font-mono': paper ? SERIF : MONO,
    '--font-label': `${font}px`,
    '--font-caption': `${paper ? font : font - 1}px`,
    '--font-title': `${paper ? font : font + 2}px`,
  };
}
