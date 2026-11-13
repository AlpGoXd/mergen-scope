import { describe, expect, it } from 'vitest';
import {
  CREATED_HUES, SOURCE_HUES, allocateTraceColors, clampChroma, createdOrder, inSrgb, symbolFor, traceColor, traceWidth,
  type PaletteTrace,
} from '../../src/domain/trace-palette';

const src = (id: string): PaletteTrace => ({ id, kind: 'raw' });
const kid = (id: string, parent: string): PaletteTrace => ({ id, kind: 'derived', sourceTraceIds: [parent] });
const hues = (m: Map<string, { hue: number }>, ids: string[]): number[] => ids.map((id) => m.get(id)!.hue);

describe('source colours: next free, stable, reused', () => {
  it('hands out the 8 hues in the fixed order', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const m = allocateTraceColors(ids.map(src));
    expect(hues(m, ids)).toEqual([...SOURCE_HUES]);
    expect([...m.values()].every((a) => a.round === 0)).toBe(true);
  });
  it('keeps a trace’s colour when others are removed, and reuses the freed hue first', () => {
    const first = allocateTraceColors(['a', 'b', 'c'].map(src));
    const afterRemove = allocateTraceColors(['a', 'c'].map(src), first);
    expect(afterRemove.get('c')!.hue).toBe(first.get('c')!.hue);
    const withNew = allocateTraceColors(['a', 'c', 'd'].map(src), afterRemove);
    expect(withNew.get('d')!.hue).toBe(first.get('b')!.hue); // b's hue was free
  });
  it('a 9th source repeats hue 1 in round 1', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `t${i}`);
    const m = allocateTraceColors(ids.map(src));
    expect(m.get('t8')).toMatchObject({ hue: SOURCE_HUES[0], round: 1, palette: 'source' });
  });
  it('works the same for any file: S4P parameters get hues 1–4', () => {
    const m = allocateTraceColors(['S11', 'S21', 'S31', 'S41'].map(src));
    expect(hues(m, ['S11', 'S21', 'S31', 'S41'])).toEqual(SOURCE_HUES.slice(0, 4));
  });
});

describe('created colours: own palette, +1, −1, then forward', () => {
  it('order around a 90° parent is 112.5, 67.5, 157.5, 202.5, 247.5, 292.5, 337.5, 22.5', () => {
    expect(createdOrder(90).map((i) => CREATED_HUES[i])).toEqual([112.5, 67.5, 157.5, 202.5, 247.5, 292.5, 337.5, 22.5]);
  });
  it('children of a 90° source follow that order and never take a source hue', () => {
    // parent 90° is the 3rd source: a(270), b(0), p(90)
    const traces = [src('a'), src('b'), src('p'), kid('f1', 'p'), kid('f2', 'p'), kid('f3', 'p')];
    const m = allocateTraceColors(traces);
    expect(hues(m, ['f1', 'f2', 'f3'])).toEqual([112.5, 67.5, 157.5]);
    for (const id of ['f1', 'f2', 'f3']) expect(SOURCE_HUES as readonly number[]).not.toContain(m.get(id)!.hue);
  });
  it('skips created colours already on screen', () => {
    // a(270): its first child takes 292.5; p(90) children then skip nothing near; force a clash:
    const traces = [src('a'), src('b'), src('p'), kid('x', 'b'), kid('f1', 'p')];
    const m = allocateTraceColors(traces);
    expect(m.get('x')!.hue).toBe(22.5);   // child of 0°: one step forward
    expect(m.get('f1')!.hue).toBe(112.5); // unaffected
    const busy = allocateTraceColors([src('a'), src('b'), src('p'), kid('y', 'p'), kid('z', 'p')]);
    const more = allocateTraceColors([src('a'), src('b'), src('p'), kid('y', 'p'), kid('z', 'p'), kid('w', 'p')], busy);
    expect(more.get('w')!.hue).toBe(157.5);
  });
  it('a child of a child walks from its parent’s created hue', () => {
    const m = allocateTraceColors([src('a'), src('b'), src('p'), kid('f1', 'p'), kid('g1', 'f1')]);
    expect(m.get('f1')!.hue).toBe(112.5);
    expect(m.get('g1')!.hue).toBe(157.5); // first created hue after 112.5
  });
  it('keeps created colours stable', () => {
    const one = allocateTraceColors([src('p'), kid('f1', 'p'), kid('f2', 'p')]);
    const two = allocateTraceColors([src('p'), kid('f2', 'p')], one);
    expect(two.get('f2')!.hue).toBe(one.get('f2')!.hue);
  });
});

describe('symbols setting', () => {
  const m = allocateTraceColors(Array.from({ length: 10 }, (_, i) => src(`t${i}`)));
  it('off never shows a symbol', () => expect(symbolFor(m.get('t9')!, 'off')).toBeNull());
  it('repeat shows symbols only on repeated colours', () => {
    expect(symbolFor(m.get('t0')!, 'repeat')).toBeNull();
    expect(symbolFor(m.get('t8')!, 'repeat')).toBe('circle');
    expect(symbolFor(m.get('t9')!, 'repeat')).toBe('circle');
  });
  it('always gives every trace a symbol, different for a repeated colour', () => {
    expect(symbolFor(m.get('t0')!, 'always')).toBe('circle');
    expect(symbolFor(m.get('t8')!, 'always')).not.toBe(symbolFor(m.get('t0')!, 'always'));
  });
});

describe('colour strings', () => {
  it('stay inside the sRGB gamut in both themes and both tones', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const palette of ['source', 'created'] as const) {
        const list = palette === 'source' ? SOURCE_HUES : CREATED_HUES;
        list.forEach((hue, index) => {
          const s = traceColor({ palette, index, round: 0, hue }, theme);
          const [l, c, h] = s.slice(6, -1).split(' ').map(Number) as [number, number, number];
          expect(inSrgb(l, c, h)).toBe(true);
        });
      }
    }
  });
  it('clampChroma leaves in-gamut colours alone', () => expect(clampChroma(0.58, 0.05, 270)).toBe(0.05));
  it('created traces are 2 px, sources 1.5 px', () => {
    expect(traceWidth({ palette: 'created', index: 0, round: 0, hue: 22.5 })).toBe(2);
    expect(traceWidth({ palette: 'source', index: 0, round: 0, hue: 270 })).toBe(1.5);
  });
});
