import { describe, expect, it } from 'vitest';
import { IDLE_SENTENCE, footerSentence, formatPointerXY, shortName, shortTraceName } from '../../src/domain/footer-state';
import type { SentenceInput } from '../../src/domain/footer-state';
import { MOUSE_HINTS, footerHints } from '../../src/domain/shortcuts';
import { smithPointerText } from '../../src/domain/smith/readout';

const none: SentenceInput = { armed: null, refMode: null, markers: [], refLines: [] };
const m = (id: string, type: 'normal' | 'delta' = 'normal', label: string | null = null) => ({ id, type, label });

describe('footerSentence', () => {
  it('says what a click does when nothing is armed', () => {
    expect(footerSentence(none)).toEqual({ text: IDLE_SENTENCE, tone: null });
    expect(IDLE_SENTENCE).toBe('Click: select · drag: move');
  });

  it('names the next marker and the colour group of the armed tool', () => {
    expect(footerSentence({ ...none, armed: { kind: 'normal' } })).toEqual({ text: 'Placing M1 · click a trace · Esc cancels', tone: 'marker' });
    expect(footerSentence({ ...none, armed: { kind: 'normal' }, markers: [m('a'), m('b')] }).text).toBe('Placing M3 · click a trace · Esc cancels');
  });

  it('names the reference of a delta marker, by role label when it has one', () => {
    const markers = [m('a'), m('b', 'normal', 'F1')];
    expect(footerSentence({ ...none, markers, armed: { kind: 'delta', refId: 'a' } }).text).toBe('Placing DM3 (Δ from M1) · click a trace · Esc cancels');
    expect(footerSentence({ ...none, markers, armed: { kind: 'delta', refId: 'b' } }).text).toBe('Placing DM3 (Δ from F1) · click a trace · Esc cancels');
  });

  it('names the next line, and a line tool wins over a marker tool as in the toolbar', () => {
    const line = (label: string) => ({ id: 1, type: 'v' as const, value: 1, paneIds: [], label });
    expect(footerSentence({ ...none, refMode: 'v' })).toEqual({ text: 'Placing V1 · click the plot · Esc cancels', tone: 'lines' });
    expect(footerSentence({ ...none, refMode: 'v', refLines: [line('V1'), line('V4')], armed: { kind: 'normal' } }).text).toBe('Placing V5 · click the plot · Esc cancels');
  });
});

describe('names and numbers', () => {
  it('cuts to 16 characters with an ellipsis', () => {
    expect(shortName('S21')).toBe('S21');
    expect(shortName('1234567890123456')).toBe('1234567890123456');
    expect(shortName('12345678901234567')).toBe('123456789012345…');
    expect(shortName('12345678901234567')).toHaveLength(16);
  });

  it('puts the trace before the file name of a Touchstone label', () => {
    expect(shortTraceName('lna_board_rev3.s2p S21 dB', 'lna_board_rev3.s2p')).toBe('S21 dB · lna_bo…');
    expect(shortTraceName('My renamed trace', 'lna_board_rev3.s2p')).toBe('My renamed trace');
    expect(shortTraceName('Spectrum 1', null)).toBe('Spectrum 1');
  });

  it('joins X and Y with two spaces and a real minus', () => {
    expect(formatPointerXY('2.4370 GHz', '-12.31 dB')).toBe('2.4370 GHz  −12.31 dB');
    expect(formatPointerXY('1 ms', '5.00 V')).toBe('1 ms  5.00 V');
  });

  it('writes the Smith pointer as Z and Γ', () => {
    expect(smithPointerText({ re: 0.2, im: 0.4 }, 50)).toBe('Z 50 + j50 Ω  Γ 0.45 ∠ 63°');
    expect(smithPointerText({ re: 0, im: 0 }, 50)).toBe('Z 50 + j0 Ω  Γ 0.00 ∠ 0°');
    expect(smithPointerText({ re: -0.2, im: -0.4 }, 50)).toBe('Z 25 − j25 Ω  Γ 0.45 ∠ −117°');
    expect(smithPointerText({ re: 1, im: 0 }, 50)).toBe('Z ∞ Ω  Γ 1.00 ∠ 0°');
  });
});

describe('footer mouse hints', () => {
  const text = (context: Parameters<typeof footerHints>[0]) => footerHints(context).map(hint => `${hint.action} ${hint.effect}`);

  it('are 3–4 per pane type, and short while armed or with no file', () => {
    expect(text('chart')).toEqual(['Right-drag X zoom', 'Scroll Y scale', 'Ctrl+drag pan', 'Double-click fit']);
    expect(text('smith')).toEqual(['Scroll zoom', 'Ctrl+drag pan', 'Double-click fit']);
    expect(text('armed')).toEqual(['Click place', 'Esc cancel']);
    expect(text('empty')).toEqual(['Drop files anywhere', 'Ctrl+O open']);
  });

  it('never mention a middle-click fit', () => {
    expect(JSON.stringify(MOUSE_HINTS).toLowerCase()).not.toContain('middle-click');
  });

  it('all come from a row Help lists', () => {
    for (const context of ['chart', 'smith', 'table', 'armed', 'empty'] as const) {
      for (const hint of MOUSE_HINTS.flatMap(row => row.footer?.[context] ? [row] : [])) expect(hint.label.length).toBeGreaterThan(0);
    }
  });
});
