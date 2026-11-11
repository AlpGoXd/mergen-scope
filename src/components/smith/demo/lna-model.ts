import type { SmithSample } from '../../../types/smith-plot';
import type { Complex } from '../../../types/touchstone';

/**
 * Synthetic reflection data shaped like an LNA board ("lna_board_rev3.s2p"), for the demo page
 * and the screenshots only. Not measured data.
 *
 * S11: a series RLC resonant at 2.45 GHz behind a short line (the board P5 model).
 * S22: a shunt RC with a series inductor behind a shorter line.
 */
export const LNA_Z0 = 50;
export const LNA_F0_HZ = 2.45e9;

const div = (a: Complex, b: Complex): Complex => {
  const den = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den };
};
const toGamma = (z: Complex, z0: number): Complex => div({ re: z.re - z0, im: z.im }, { re: z.re + z0, im: z.im });
/** A line of delay τ in front of the load turns Γ by −2ωτ. */
const behindLine = (g: Complex, frequencyHz: number, delaySeconds: number): Complex => {
  const angle = -2 * 2 * Math.PI * frequencyHz * delaySeconds;
  const c = Math.cos(angle), s = Math.sin(angle);
  return { re: g.re * c - g.im * s, im: g.re * s + g.im * c };
};

export const S11_MODEL = { ohms: 42, henries: 6e-9, farads: 1 / ((2 * Math.PI * LNA_F0_HZ) ** 2 * 6e-9), delaySeconds: 30e-12 } as const;

export function lnaS11(frequencyHz: number): Complex {
  const w = 2 * Math.PI * frequencyHz;
  const z = { re: S11_MODEL.ohms, im: w * S11_MODEL.henries - 1 / (w * S11_MODEL.farads) };
  return behindLine(toGamma(z, LNA_Z0), frequencyHz, S11_MODEL.delaySeconds);
}

export function lnaS22(frequencyHz: number): Complex {
  const w = 2 * Math.PI * frequencyHz;
  const shunt = div({ re: 85, im: 0 }, { re: 1, im: w * 85 * 0.9e-12 });
  const z = { re: shunt.re + 4, im: shunt.im + w * 1.8e-9 };
  return behindLine(toGamma(z, LNA_Z0), frequencyHz, 18e-12);
}

export function sweep(model: (frequencyHz: number) => Complex, startHz = 0.5e9, stopHz = 6e9, points = 201): SmithSample[] {
  return Array.from({ length: points }, (_, index) => {
    const frequencyHz = startHz + ((stopHz - startHz) * index) / (points - 1);
    return { frequencyHz, gamma: model(frequencyHz) };
  });
}
