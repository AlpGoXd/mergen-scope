import { describe, expect, it } from 'vitest';
import { paneDisplayState } from '../../src/domain/pane-display-state';

describe('paneDisplayState', () => {
  it('shows the picker only for an untyped empty pane', () => {
    expect(paneDisplayState({ typed: false }, 0)).toBe('picker');
    expect(paneDisplayState({ typed: true }, 0)).toBe('empty-typed');
  });

  it('shows content whenever traces are present', () => {
    expect(paneDisplayState({ typed: true }, 1)).toBe('content');
    expect(paneDisplayState({ typed: false }, 1)).toBe('content');
  });
});
