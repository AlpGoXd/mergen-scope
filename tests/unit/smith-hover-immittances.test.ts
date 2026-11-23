import { describe, expect, it } from 'vitest';
import { hoverImmittances } from '../../src/domain/smith/readout';

describe('hoverImmittances', () => {
  it('shows both Z and Y on the Z + Y grid, whatever the readout list says', () => {
    expect(hoverImmittances('both', ['z', 'gamma'])).toEqual(['z', 'y']);
    expect(hoverImmittances('both', [])).toEqual(['z', 'y']);
  });

  it('shows both when the readout list asks for both', () => {
    expect(hoverImmittances('z', ['z', 'y', 'gamma'])).toEqual(['z', 'y']);
  });

  it('keeps one row otherwise: Y when only Y is listed, Z in every other case', () => {
    expect(hoverImmittances('y', ['y', 'gamma'])).toEqual(['y']);
    expect(hoverImmittances('z', ['z', 'gamma', 'vswr'])).toEqual(['z']);
    expect(hoverImmittances('y', ['z', 'gamma'])).toEqual(['z']);
    expect(hoverImmittances('z', [])).toEqual(['z']);
  });
});

describe('reference text', () => {
  it('names the reference impedance and the hint carries it', async () => {
    const { formatReference, gammaHint } = await import('../../src/domain/smith/readout');
    expect(formatReference(50)).toBe('50 Ω');
    expect(formatReference(75.00001)).toBe('75 Ω');
    expect(formatReference(Number.NaN)).toBe('—');
    expect(gammaHint(50)).toContain('Z₀ = 50 Ω');
    expect(gammaHint(50)).toContain('same Γ');
  });
});
