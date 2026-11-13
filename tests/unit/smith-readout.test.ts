import { describe, expect, it } from 'vitest';
import { admittanceToGamma, gammaToAdmittance, gammaToImpedance, impedanceToGamma } from '../../src/domain/smith/numerics.ts';
import {
  formatAdmittance, formatEquivalent, formatGammaPolar, formatImpedance, formatReturnLoss, formatSmithFrequency,
  formatSmithFrequencyShort, formatVswr, gammaPolar, renormalizeGamma, smithReadout,
} from '../../src/domain/smith/readout.ts';
import { fitViewport, gammaToPoint, zoomAt } from '../../src/domain/smith/viewport.ts';
import { LNA_F0_HZ, S11_MODEL, lnaS11 } from '../../src/components/smith/demo/lna-model.ts';

const gammaOf = (re: number, im: number, z0 = 50) => {
  const result = impedanceToGamma({ re, im }, z0);
  if (result.kind !== 'value') throw new Error('no gamma');
  return result.value;
};

describe('Smith conversions with known answers', () => {
  it('maps the textbook impedances on 50 Ω', () => {
    expect(gammaOf(50, 0)).toEqual({ re: 0, im: 0 });
    expect(gammaOf(0, 0)).toEqual({ re: -1, im: 0 });
    expect(gammaOf(25, 0).re).toBeCloseTo(-1 / 3, 12);
    const g = gammaOf(50, 50);
    expect(g.re).toBeCloseTo(0.2, 12);
    expect(g.im).toBeCloseTo(0.4, 12);
    // Open: Y = 0 gives Γ = 1, and Z at Γ = 1 is singular rather than a made-up number.
    const open = admittanceToGamma({ re: 0, im: 0 }, 50);
    expect(open.kind === 'value' && open.value.re).toBe(1);
    expect(open.kind === 'value' && Math.abs(open.value.im)).toBe(0);
    expect(gammaToImpedance({ re: 1, im: 0 }, 50).kind).toBe('undefined');
  });

  it('round-trips Γ ↔ Z ↔ Y for another reference impedance', () => {
    const g = gammaOf(30, -40, 75);
    const z = gammaToImpedance(g, 75), y = gammaToAdmittance(g, 75);
    if (z.kind !== 'value' || y.kind !== 'value') throw new Error('singular');
    expect(z.value.re).toBeCloseTo(30, 9);
    expect(z.value.im).toBeCloseTo(-40, 9);
    // Y = 1/Z = (30 + j40)/2500
    expect(y.value.re).toBeCloseTo(0.012, 12);
    expect(y.value.im).toBeCloseTo(0.016, 12);
    const back = admittanceToGamma(y.value, 75);
    if (back.kind !== 'value') throw new Error('singular');
    expect(back.value.re).toBeCloseTo(g.re, 12);
    expect(back.value.im).toBeCloseTo(g.im, 12);
  });

  it('reads |Γ|, ∠Γ, VSWR, return loss and the equivalent element', () => {
    const r = smithReadout(gammaOf(50, 50), 50, 2e9);
    if (!r) throw new Error('no readout');
    expect(r.magnitude).toBeCloseTo(Math.sqrt(0.2), 12);
    expect(r.angleDeg).toBeCloseTo((Math.atan2(0.4, 0.2) * 180) / Math.PI, 12);
    expect(r.vswr.kind === 'value' && r.vswr.value).toBeCloseTo((1 + Math.sqrt(0.2)) / (1 - Math.sqrt(0.2)), 12);
    if (r.returnLossDb.kind === 'value') expect(r.returnLossDb.value).toBeCloseTo(-10 * Math.log10(0.2), 12);
    // X = 50 Ω at 2 GHz is L = 50 / (2π · 2e9) = 3.979 nH.
    if (r.equivalent.kind === 'value') { expect(r.equivalent.value.kind).toBe('L'); expect(r.equivalent.value.value).toBeCloseTo(50 / (2 * Math.PI * 2e9), 18); }
    expect(r.equivalent.kind).toBe('value');

    const quarter = smithReadout(gammaOf(25, 0), 50, 1e9);
    expect(quarter?.angleDeg).toBeCloseTo(180, 12);
    if (quarter?.vswr.kind === 'value') expect(quarter.vswr.value).toBeCloseTo(2, 12);
    if (quarter?.returnLossDb.kind === 'value') expect(quarter.returnLossDb.value).toBeCloseTo(20 * Math.log10(3), 12);
    expect(gammaPolar({ re: 0, im: 0 })).toEqual({ magnitude: 0, angleDeg: 0 });
    expect(gammaPolar({ re: Number.NaN, im: 0 })).toBeNull();
    expect(smithReadout({ re: Number.POSITIVE_INFINITY, im: 0 }, 50, 1e9)).toBeNull();
  });

  it('reads the board P5 model: a series RLC at 2.45 GHz behind a short line', () => {
    // At resonance the load is the bare 42 Ω, so |Γ| = 8/92; the line turns it by −2ωτ from 180°.
    const atF0 = gammaPolar(lnaS11(LNA_F0_HZ));
    expect(atF0?.magnitude).toBeCloseTo(8 / 92, 9);
    expect(atF0?.angleDeg).toBeCloseTo(180 - 2 * 360 * LNA_F0_HZ * S11_MODEL.delaySeconds, 6);
    // Away from resonance: undo the line and compare with R + j(ωL − 1/ωC) worked out here.
    const f = 3e9, w = 2 * Math.PI * f;
    const turn = 2 * w * S11_MODEL.delaySeconds;
    const g = lnaS11(f);
    const atLoad = { re: g.re * Math.cos(turn) - g.im * Math.sin(turn), im: g.re * Math.sin(turn) + g.im * Math.cos(turn) };
    const z = gammaToImpedance(atLoad, 50);
    if (z.kind !== 'value') throw new Error('singular');
    expect(z.value.re).toBeCloseTo(42, 6);
    expect(z.value.im).toBeCloseTo(w * 6e-9 - 1 / (w * S11_MODEL.farads), 6);
    // A lossless line never changes |Γ|.
    expect(Math.hypot(g.re, g.im)).toBeCloseTo(Math.hypot(atLoad.re, atLoad.im), 12);
  });

  it('keeps an active port (|Γ| = 1.3) as it is: negative R, no VSWR, and a fit that includes it', () => {
    const g = { re: 1.3 * Math.cos(Math.PI / 3), im: 1.3 * Math.sin(Math.PI / 3) };
    const r = smithReadout(g, 50, 1e9);
    if (!r) throw new Error('no readout');
    expect(r.magnitude).toBeCloseTo(1.3, 12);
    expect(r.impedance.kind).toBe('value');
    if (r.impedance.kind === 'value') {
      expect(r.impedance.value.re).toBeLessThan(0);
      expect(formatImpedance(r.impedance).startsWith('−')).toBe(true);
    }
    expect(r.vswr).toEqual({ kind: 'undefined', reason: 'active' });
    expect(formatVswr(r.vswr)).toBe('—');
    const fit = fitViewport(400, 300, [g], 0);
    expect(fit?.scale).toBeCloseTo(150 / 1.3, 9);
    const p = fit && gammaToPoint(g, fit);
    expect(p && p.x >= 0 && p.x <= 400 && p.y >= 0 && p.y <= 300).toBe(true);
  });

  it('renormalises to another Z0 with Γ′ = (Z − Z0′)/(Z + Z0′)', () => {
    const on75 = renormalizeGamma(gammaOf(75, 0, 50), 50, 75);
    if (on75.kind !== 'value') throw new Error('singular');
    expect(on75.value.re).toBeCloseTo(0, 12);
    const complex = renormalizeGamma(gammaOf(30, -40, 50), 50, 75);
    const direct = gammaOf(30, -40, 75);
    if (complex.kind !== 'value') throw new Error('singular');
    expect(complex.value.re).toBeCloseTo(direct.re, 12);
    expect(complex.value.im).toBeCloseTo(direct.im, 12);
    expect(renormalizeGamma({ re: 1, im: 0 }, 50, 75)).toEqual({ kind: 'value', value: { re: 1, im: 0 } });
    expect(renormalizeGamma({ re: 0.1, im: 0.2 }, 50, 50)).toEqual({ kind: 'value', value: { re: 0.1, im: 0.2 } });
    expect(renormalizeGamma({ re: 0.1, im: 0.2 }, 50, 0).kind).toBe('undefined');
  });

  it('keeps circles round when zooming', () => {
    const fit = fitViewport(640, 360, [], 20);
    if (!fit) throw new Error('no fit');
    const zoomed = zoomAt(fit, { x: 500, y: 90 }, 3.7);
    if (!zoomed) throw new Error('no zoom');
    const c = gammaToPoint({ re: 0.5, im: 0 }, zoomed);
    for (const angle of [0, 1, 2, 3, 4, 5]) {
      const p = gammaToPoint({ re: 0.5 + 0.5 * Math.cos(angle), im: 0.5 * Math.sin(angle) }, zoomed);
      if (!p || !c) throw new Error('no point');
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(0.5 * zoomed.scale, 9);
    }
  });
});

describe('Smith readout text', () => {
  it('writes Z as R + jX Ω and Y in mS, with a real minus sign', () => {
    expect(formatImpedance({ kind: 'value', value: { re: 50, im: 50 } })).toBe('50.00 + j50.00 Ω');
    expect(formatImpedance({ kind: 'value', value: { re: 42.1, im: -18.6 } })).toBe('42.10 − j18.60 Ω');
    expect(formatImpedance({ kind: 'value', value: { re: -120.44, im: 1234.5 } })).toBe('−120.4 + j1235 Ω');
    expect(formatImpedance({ kind: 'undefined', reason: 'singular' })).toBe('∞ Ω');
    expect(formatAdmittance({ kind: 'value', value: { re: 0.012, im: 0.016 } })).toBe('12.00 + j16.00 mS');
  });
  it('writes Γ, VSWR, return loss, the equivalent element and frequency', () => {
    expect(formatGammaPolar(1 / 3, 180)).toBe('0.333 ∠ 180.0°');
    expect(formatGammaPolar(0.4472, -63.43)).toBe('0.447 ∠ −63.4°');
    expect(formatVswr({ kind: 'value', value: 2 })).toBe('2.00');
    expect(formatVswr({ kind: 'undefined', reason: 'singular' })).toBe('∞');
    expect(formatReturnLoss({ kind: 'value', value: 9.5424 })).toBe('9.54 dB');
    expect(formatEquivalent({ kind: 'value', value: { kind: 'L', value: 3.979e-9 } })).toBe('3.979 nH');
    expect(formatEquivalent({ kind: 'value', value: { kind: 'C', value: 1.3e-12 } })).toBe('1.300 pF');
    expect(formatEquivalent({ kind: 'undefined', reason: 'zero-reactance' })).toBe('—');
    expect(formatSmithFrequency(2.45e9)).toBe('2.4500 GHz');
    expect(formatSmithFrequency(915e6)).toBe('915.000 MHz');
    expect(formatSmithFrequencyShort(500e6)).toBe('500 MHz');
    expect(formatSmithFrequencyShort(6e9)).toBe('6 GHz');
    expect(formatSmithFrequencyShort(2.45e9)).toBe('2.45 GHz');
  });
});
