import { describe, expect, it } from 'vitest';
import { isTextEntry } from '../../src/hooks/use-keyboard';

const el = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
};

describe('isTextEntry (who owns Ctrl+Z)', () => {
  it('leaves undo to text fields', () => {
    expect(isTextEntry(el('<input type="text">'))).toBe(true);
    expect(isTextEntry(el('<input>'))).toBe(true);
    expect(isTextEntry(el('<textarea></textarea>'))).toBe(true);
    expect(isTextEntry(el('<select></select>'))).toBe(true);
  });
  it('gives undo to the workspace on buttons, checkboxes and nothing focused', () => {
    expect(isTextEntry(el('<button>Pane settings</button>'))).toBe(false);
    expect(isTextEntry(el('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(el('<div role="menuitem">Pane 2</div>'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
