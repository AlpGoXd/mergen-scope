import { describe, expect, it } from 'vitest';
import { oklchHue } from '../../src/domain/color-hue';

describe('oklchHue', () => {
  it('reads the hue of an oklch() colour directly', () => {
    expect(oklchHue('oklch(0.75 0.13 135)')).toBe(135);
    expect(oklchHue('oklch(0.46 0.1 112.5)')).toBe(112.5);
    expect(oklchHue('oklch(0.58 0.16 270)')).toBe(270);
    expect(oklchHue('oklch(0.5 0.1 -90 / 0.5)')).toBe(270);
  });
  it('converts hex and rgb colours to the OKLCH hue (reference values from the CSS Color 4 definition)', () => {
    expect(oklchHue('#ff0000')).toBeCloseTo(29.2, 0);
    expect(oklchHue('#00ff00')).toBeCloseTo(142.5, 0);
    expect(oklchHue('#0000ff')).toBeCloseTo(264.1, 0);
    expect(oklchHue('rgb(255, 0, 0)')).toBeCloseTo(29.2, 0);
    expect(oklchHue('#f00')).toBeCloseTo(29.2, 0);
  });
  it('has no hue for greys and unknown strings', () => {
    expect(oklchHue('#808080')).toBeNull();
    expect(oklchHue('var(--tr0)')).toBeNull();
    expect(oklchHue('not a colour')).toBeNull();
  });
});
