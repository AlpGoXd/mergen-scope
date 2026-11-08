import { describe, expect, it } from 'vitest';
import { createdTraceColor, makeTraceColorResolver } from '../../src/domain/trace-colors';
import { makeTestTrace } from './helpers';
import type { Trace } from '../../src/types/trace';

const source = (id: string) => makeTestTrace({ id, name: id });
const created = (id: string, parents: string[]) => makeTestTrace({ id, name: id, kind: 'derived', operationType: 'derived', sourceTraceIds: parents } as Partial<Trace>);
const colorHue = (color: string) => Number(color.match(/ ([\d.]+)\)$/)?.[1]);

describe('trace family colors', () => {
  it('assigns the four family offsets in order and keeps assignments when samples or input order change', () => {
    const parent = source('source');
    const children = ['a','b','c','d'].map(id => created(id, ['source']));
    const resolve = makeTraceColorResolver([parent, ...children], ['source-color'], [], {});
    expect(children.map(child => colorHue(resolve(child)))).toEqual([292.5, 247.5, 337.5, 202.5]);
    const changed = { ...parent, data: [{ freq: 9, amp: 123 }] };
    const reordered = makeTraceColorResolver([changed, ...children.toReversed()], ['source-color'], [], {});
    expect(children.map(child => reordered(child))).toEqual(children.map(child => resolve(child)));
  });
  it('chooses the free family slot nearest a two-parent midpoint and respects overrides', () => {
    const a = source('a'), b = source('b');
    const first = created('1', ['a', 'b']), second = created('2', ['a', 'b']);
    const resolve = makeTraceColorResolver([a, b, first, second], ['a-color', 'b-color'], [], { '2': 'custom' });
    expect(colorHue(resolve(first))).toBe(292.5);
    expect(resolve(second)).toBe('custom');
    const plain = makeTraceColorResolver([a, b, first, second], ['a-color', 'b-color'], [], {});
    expect(colorHue(plain(second))).toBe(337.5);
  });
  it('clamps light and dark chroma to linear sRGB for every half-slot hue', () => {
    for (const theme of ['light', 'dark'] as const) for (let h = 0; h < 360; h += 22.5) {
      const match = createdTraceColor(h, theme).match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/)!;
      const l = Number(match[1]), c = Number(match[2]), angle = Number(match[3]) * Math.PI / 180;
      expect(l).toBe(theme === 'light' ? 0.36 : 0.88);
      expect(c).toBeLessThanOrEqual(theme === 'light' ? 0.1 : 0.045);
      const a = c * Math.cos(angle), b = c * Math.sin(angle);
      const x = (l + .3963377774 * a + .2158037573 * b) ** 3, y = (l - .1055613458 * a - .0638541728 * b) ** 3, z = (l - .0894841775 * a - 1.291485548 * b) ** 3;
      for (const channel of [4.0767416621*x-3.3077115913*y+.2309699292*z, -1.2684380046*x+2.6097574011*y-.3413193965*z, -.0041960863*x-.7034186147*y+1.707614701*z]) {
        expect(channel).toBeGreaterThanOrEqual(0); expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});
