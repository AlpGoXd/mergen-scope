export const APP_VERSION = '1.0.0-beta.1';
export const shortcuts = [
  ['Ctrl+O', 'Open files'], ['Ctrl+S', 'Save workspace'], ['Ctrl+Shift+E', 'Export…'],
  ['Ctrl+Shift+C', 'Copy target pane as image'], ['Ctrl+Shift+S', 'Download target pane as image'],
  ['Ctrl+,', 'Settings'], ['N', 'New marker'], ['Shift+N', 'Δ from the selected marker'],
  ['M / S / L / P', 'Toggle Markers / Search / Lines / Pane groups'], ['[ / ]', 'Left / right panel'],
  ['Space / F', 'Fit all'], ['Backspace', 'Previous zoom'], ['Esc', 'Cancel / close'],
  ['Delete', 'Remove the selected marker or line'], ['← / →', 'Move the selected marker one point'],
  ['Ctrl+Z', 'Undo'], ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
] as const;
export const mouseShortcuts = [
  ['Right-drag', 'X range zoom'], ['Scroll', 'Y scale (Smith: zoom both)'], ['Shift+scroll', 'Y offset'],
  ['Ctrl+scroll', 'X zoom around the cursor'], ['Ctrl+drag / Middle-drag', 'Pan'], ['Double-click', 'Fit all'],
  ['Click a marker tag', 'Select it'], ['Right-click a marker', 'Add Δ, move to peak, delete'],
] as const;
export function feedbackUrl(kind: 'problem' | 'idea'): string {
  const title = kind === 'problem' ? 'Problem: ' : 'Idea: ';
  const prompt = kind === 'problem' ? 'What happened?\n\nWhat did you expect?' : 'Describe your idea:';
  const body = `${prompt}\n\nApp version: ${APP_VERSION}\nBrowser / OS: ${navigator.userAgent}`;
  return `https://github.com/AlpGoXd/mergen-scope/issues/new?${new URLSearchParams({ title, body })}`;
}
