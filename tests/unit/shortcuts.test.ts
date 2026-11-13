import { describe, expect, it } from 'vitest';
import { MOUSE_HINTS, SHORTCUTS, findShortcut, shortcutText } from '../../src/domain/shortcuts';
import type { KeyStroke } from '../../src/domain/shortcuts';
import { BURST_MS, recordZoom, takePreviousZoom, pruneZoomHistory } from '../../src/domain/zoom-history';
import type { PaneZoom, ZoomHistory } from '../../src/domain/zoom-history';

const key = (k: string, code: string, mods: Partial<Pick<KeyStroke, 'ctrl' | 'shift' | 'alt'>> = {}): KeyStroke => ({ key: k, code, ctrl: false, shift: false, alt: false, ...mods });

describe('shortcut registry', () => {
  it('holds exactly the agreed shortcuts, each once', () => {
    expect(SHORTCUTS.map(item => item.id)).toEqual(['open', 'save', 'export', 'copy-image', 'download-image', 'settings', 'help', 'new-marker', 'delta-marker', 'fit-pane', 'previous-zoom', 'escape', 'delete', 'move-marker', 'undo', 'redo']);
    expect(SHORTCUTS.map(item => item.keys.map(combo => combo.join('+')).join(' / '))).toEqual([
      'Ctrl+O', 'Ctrl+S', 'Ctrl+Shift+E', 'Ctrl+Shift+C', 'Ctrl+Shift+S', 'Ctrl+,', 'Shift+/', 'N', 'Shift+N', 'Space', 'Backspace', 'Esc', 'Delete', '← / →', 'Ctrl+Z', 'Ctrl+Y / Ctrl+Shift+Z',
    ]);
  });
  it('every listed stroke triggers its own shortcut and no other', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.strokes.length).toBe(shortcut.keys.length);
      for (const stroke of shortcut.strokes) {
        expect(findShortcut(stroke)?.id).toBe(shortcut.id);
        expect(SHORTCUTS.filter(other => other.match(stroke)).map(other => other.id)).toEqual([shortcut.id]);
      }
    }
  });
  it('⌘ counts as Ctrl, and Alt never triggers', () => {
    expect(findShortcut(key('o', 'KeyO', { ctrl: true }))?.id).toBe('open');
    expect(findShortcut(key('o', 'KeyO', { ctrl: true, alt: true }))).toBeUndefined();
    expect(findShortcut(key('n', 'KeyN', { alt: true }))).toBeUndefined();
  });
  it('the retired keys do nothing: M / S / L / P, [ and ], F, 1–4, Backspace with Ctrl', () => {
    for (const letter of ['m', 's', 'l', 'p', 'f', '[', ']', '1', '2', '3', '4']) expect(findShortcut(key(letter, `Key${letter.toUpperCase()}`))).toBeUndefined();
    expect(findShortcut(key('Backspace', 'Backspace', { ctrl: true }))).toBeUndefined();
  });
  it('gives text for titles and menus, and mouse hints for Help', () => {
    expect(shortcutText('copy-image')).toBe('Ctrl+Shift+C');
    expect(shortcutText('redo')).toBe('Ctrl+Y / Ctrl+Shift+Z');
    expect(MOUSE_HINTS.length).toBeGreaterThan(4);
  });
});

describe('zoom history (Backspace)', () => {
  const x = (left: number, right: number): PaneZoom => ({ x: { left, right }, y: null });
  const fitted: PaneZoom = { x: null, y: null };
  it('goes back one gesture at a time and ends at the first zoom', () => {
    let h: ZoomHistory = new Map();
    h = recordZoom(h, 'p', fitted, 0);
    h = recordZoom(h, 'p', x(0, 50), 1000);
    h = recordZoom(h, 'p', x(10, 40), 3000);
    const back = takePreviousZoom(h, 'p');
    expect(back?.zoom).toEqual(x(0, 50));
    const again = back ? takePreviousZoom(back.history, 'p') : null;
    expect(again?.zoom).toEqual(fitted);
    expect(again ? takePreviousZoom(again.history, 'p') : 'none').toBeNull();
  });
  it('treats a burst of changes as one step', () => {
    let h: ZoomHistory = recordZoom(new Map(), 'p', fitted, 0);
    h = recordZoom(h, 'p', x(0, 90), 1000);
    h = recordZoom(h, 'p', x(0, 80), 1000 + BURST_MS / 2);
    h = recordZoom(h, 'p', x(0, 70), 1000 + BURST_MS);
    expect(takePreviousZoom(h, 'p')?.zoom).toEqual(fitted);
  });
  it('a restore does not push a new step, and the next change starts one', () => {
    let h: ZoomHistory = recordZoom(new Map(), 'p', fitted, 0);
    h = recordZoom(h, 'p', x(0, 50), 1000);
    const back = takePreviousZoom(h, 'p');
    if (!back) throw new Error('expected a step');
    h = recordZoom(back.history, 'p', back.zoom, 1100, true);
    expect(takePreviousZoom(h, 'p')).toBeNull();
    h = recordZoom(h, 'p', x(5, 6), 1200);
    expect(takePreviousZoom(h, 'p')?.zoom).toEqual(fitted);
  });
  it('forgets removed panes', () => {
    const h = recordZoom(recordZoom(new Map(), 'a', fitted, 0), 'b', fitted, 0);
    expect([...pruneZoomHistory(h, ['a']).keys()]).toEqual(['a']);
  });
});
