/**
 * The one list of keyboard shortcuts: it binds the keys (ShortcutProvider) and renders Help. Pure; a component
 * that owns an action registers a handler for its id with useShortcut().
 */

export type ShortcutId =
  | 'open' | 'save' | 'export' | 'copy-image' | 'download-image' | 'settings' | 'help'
  | 'new-marker' | 'delta-marker' | 'fit-pane' | 'previous-zoom' | 'escape' | 'delete' | 'move-marker'
  | 'undo' | 'redo';

export type ShortcutScope = 'App' | 'Target pane' | 'Markers and lines' | 'History';

/** A key press reduced to what matching needs; `ctrl` is Ctrl or ⌘. */
export interface KeyStroke {
  readonly key: string;
  readonly code: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

export interface Shortcut {
  readonly id: ShortcutId;
  /** Each alternative is a list of key chips: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']]. */
  readonly keys: readonly (readonly string[])[];
  readonly label: string;
  readonly scope: ShortcutScope;
  /** A key without Ctrl: it does not fire while a button, menu or slider has focus (that control owns it). */
  readonly plain: boolean;
  readonly match: (stroke: KeyStroke) => boolean;
  /** One stroke that triggers it, per alternative (tests press these). */
  readonly strokes: readonly KeyStroke[];
}

const stroke = (key: string, code: string, mods: Partial<Pick<KeyStroke, 'ctrl' | 'shift' | 'alt'>> = {}): KeyStroke => ({ key, code, ctrl: false, shift: false, alt: false, ...mods });
const ctrlKey = (letter: string, shift = false) => (s: KeyStroke) => s.ctrl && !s.alt && s.shift === shift && s.code === `Key${letter}`;
const plainKey = (key: string, shift = false) => (s: KeyStroke) => !s.ctrl && !s.alt && s.shift === shift && s.key === key;

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'open', keys: [['Ctrl', 'O']], label: 'Open files', scope: 'App', plain: false, match: ctrlKey('O'), strokes: [stroke('o', 'KeyO', { ctrl: true })] },
  { id: 'save', keys: [['Ctrl', 'S']], label: 'Save workspace', scope: 'App', plain: false, match: ctrlKey('S'), strokes: [stroke('s', 'KeyS', { ctrl: true })] },
  { id: 'export', keys: [['Ctrl', 'Shift', 'E']], label: 'Export…', scope: 'Target pane', plain: false, match: ctrlKey('E', true), strokes: [stroke('E', 'KeyE', { ctrl: true, shift: true })] },
  { id: 'copy-image', keys: [['Ctrl', 'Shift', 'C']], label: 'Copy image of the target pane', scope: 'Target pane', plain: false, match: ctrlKey('C', true), strokes: [stroke('C', 'KeyC', { ctrl: true, shift: true })] },
  { id: 'download-image', keys: [['Ctrl', 'Shift', 'S']], label: 'Download image of the target pane', scope: 'Target pane', plain: false, match: ctrlKey('S', true), strokes: [stroke('S', 'KeyS', { ctrl: true, shift: true })] },
  { id: 'settings', keys: [['Ctrl', ',']], label: 'App settings', scope: 'App', plain: false, match: s => s.ctrl && !s.alt && !s.shift && s.key === ',', strokes: [stroke(',', 'Comma', { ctrl: true })] },
  { id: 'help', keys: [['Shift', '/']], label: 'Help', scope: 'App', plain: true, match: s => !s.ctrl && !s.alt && s.key === '?', strokes: [stroke('?', 'Slash', { shift: true })] },
  { id: 'new-marker', keys: [['N']], label: 'New marker', scope: 'Markers and lines', plain: true, match: s => plainKey('n')(s), strokes: [stroke('n', 'KeyN')] },
  { id: 'delta-marker', keys: [['Shift', 'N']], label: 'Δ marker from the selected marker', scope: 'Markers and lines', plain: true, match: s => !s.ctrl && !s.alt && s.shift && s.key.toLowerCase() === 'n', strokes: [stroke('N', 'KeyN', { shift: true })] },
  { id: 'fit-pane', keys: [['Space']], label: 'Fit the target pane', scope: 'Target pane', plain: true, match: plainKey(' '), strokes: [stroke(' ', 'Space')] },
  { id: 'previous-zoom', keys: [['Backspace']], label: 'Previous zoom of the target pane', scope: 'Target pane', plain: true, match: plainKey('Backspace'), strokes: [stroke('Backspace', 'Backspace')] },
  { id: 'escape', keys: [['Esc']], label: 'Cancel or close', scope: 'App', plain: false, match: s => !s.ctrl && !s.alt && s.key === 'Escape', strokes: [stroke('Escape', 'Escape')] },
  { id: 'delete', keys: [['Delete']], label: 'Remove the selected marker or line', scope: 'Markers and lines', plain: true, match: plainKey('Delete'), strokes: [stroke('Delete', 'Delete')] },
  { id: 'move-marker', keys: [['←'], ['→']], label: 'Move the selected marker one point', scope: 'Markers and lines', plain: true, match: s => plainKey('ArrowLeft')(s) || plainKey('ArrowRight')(s), strokes: [stroke('ArrowLeft', 'ArrowLeft'), stroke('ArrowRight', 'ArrowRight')] },
  { id: 'undo', keys: [['Ctrl', 'Z']], label: 'Undo', scope: 'History', plain: false, match: ctrlKey('Z'), strokes: [stroke('z', 'KeyZ', { ctrl: true })] },
  { id: 'redo', keys: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], label: 'Redo', scope: 'History', plain: false, match: s => ctrlKey('Y')(s) || ctrlKey('Z', true)(s), strokes: [stroke('y', 'KeyY', { ctrl: true }), stroke('Z', 'KeyZ', { ctrl: true, shift: true })] },
];

export function findShortcut(s: KeyStroke): Shortcut | undefined {
  return SHORTCUTS.find(shortcut => shortcut.match(s));
}

export function shortcutById(id: ShortcutId): Shortcut {
  const found = SHORTCUTS.find(shortcut => shortcut.id === id);
  if (!found) throw new Error(`Unknown shortcut ${id}`);
  return found;
}

/** "Ctrl+Shift+C" (first alternative), for titles and menu asides. */
export function shortcutText(id: ShortcutId): string {
  return shortcutById(id).keys.map(keys => keys.join('+')).join(' / ');
}

/** Where the footer shows mouse hints: by the target pane's type, while a tool is armed, or with no file open. */
export type MouseContext = 'chart' | 'smith' | 'table' | 'armed' | 'empty';

export interface FooterHint {
  /** The action word, in text colour. */
  readonly action: string;
  /** What it does, muted. */
  readonly effect: string;
}

export interface MouseHint {
  readonly keys: readonly (readonly string[])[];
  readonly label: string;
  /** How the footer words it, per context. A hint with no entry for a context is not shown there. */
  readonly footer?: Partial<Record<MouseContext, FooterHint>>;
}

/**
 * The one list of mouse hints: Help renders every row, the footer picks its 2–4 per context. Each row says what
 * ChartPane, SmithPane and the placement tools actually do; change a gesture and its row together.
 */
export const MOUSE_HINTS: readonly MouseHint[] = [
  { keys: [['Right-drag']], label: 'Zoom an X range; pan when zoomed in', footer: { chart: { action: 'Right-drag', effect: 'X zoom' } } },
  { keys: [['Scroll']], label: 'Y scale (Smith: zoom)', footer: { chart: { action: 'Scroll', effect: 'Y scale' }, smith: { action: 'Scroll', effect: 'zoom' } } },
  { keys: [['Shift', 'Scroll']], label: 'Y offset' },
  { keys: [['Ctrl', 'drag']], label: 'Pan the view (Smith: middle-drag also pans)', footer: { chart: { action: 'Ctrl+drag', effect: 'pan' }, smith: { action: 'Ctrl+drag', effect: 'pan' } } },
  { keys: [['Double-click']], label: 'Fit the pane', footer: { chart: { action: 'Double-click', effect: 'fit' }, smith: { action: 'Double-click', effect: 'fit' } } },
  { keys: [['Click']], label: 'Place the armed marker or line', footer: { armed: { action: 'Click', effect: 'place' } } },
  { keys: [['Click a marker tag']], label: 'Select the marker' },
  { keys: [['Click a pane']], label: 'Make it the target pane', footer: { table: { action: 'Click pane', effect: 'target' } } },
  { keys: [['Drop files']], label: 'Open them anywhere in the window', footer: { empty: { action: 'Drop files', effect: 'anywhere' } } },
];

/** The footer's hints for a context, from MOUSE_HINTS and the keyboard registry (Esc, Ctrl+O), in display order. */
export function footerHints(context: MouseContext): readonly FooterHint[] {
  const own = MOUSE_HINTS.flatMap(hint => hint.footer?.[context] ?? []);
  if (context === 'armed') return [...own, { action: shortcutText('escape'), effect: 'cancel' }];
  if (context === 'empty') return [...own, { action: shortcutText('open'), effect: 'open' }];
  return own;
}
