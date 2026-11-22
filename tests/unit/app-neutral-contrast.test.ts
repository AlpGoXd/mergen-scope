import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appNeutrals } from '../../src/components/settings/app-preferences';
import { displayTraceColor } from '../../src/domain/trace-colors';
import { CREATED_HUES, SOURCE_HUES } from '../../src/domain/trace-palette';

const css = readFileSync(new URL('../../src/appearance-colours.css', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../../docs/design/colour-values.md', import.meta.url), 'utf8');
function tokens(rule: string): Record<string, string> {
  const bodies = Array.from(css.matchAll(/^([^\n]+) \{([^}]+)\}/gm))
    .filter(match => match[1] === rule);
  if (!bodies.length) throw new Error(`Missing CSS rule ${rule}`);
  return Object.fromEntries(bodies.flatMap(rule => Array.from((rule[2] ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g), match => [match[1], match[2]])));
}

function computedToken(name: string, palette: Record<string, string>): string {
  const value = palette[name];
  if (value === undefined) throw new Error(`Missing CSS token ${name}`);
  return value
    .replace(/var\((--[\w-]+)\)/g, (_, token: string) => computedToken(token, palette))
    .replace(/calc\(([\d.]+)\s*\*\s*([\d.]+)\)/g, (_, chroma: string, scale: string) => String(Number(chroma) * Number(scale)));
}

function tuple(colour: string): [number, number, number] {
  const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(colour);
  if (!parts) throw new Error(`Expected OKLCH, got ${colour}`);
  return [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}

function luminance([lightness, chroma, hue]: ReturnType<typeof tuple>): number {
  const angle = hue * Math.PI / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);

  // Convert OKLab to linear sRGB, already linearized for WCAG luminance.
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const greyTokens = ['bg', 'panel', 'raised', 'border', 'border-strong', 'text', 'text-muted'] as const;
const selectionTokens = ['accent', 'on-fill', 'on-ink', 'on-line'] as const;

it('includes Ember as the eighth tint', () => {
  expect(appNeutrals).toHaveLength(8);
  expect(appNeutrals.at(-1)).toBe('ember');
});

describe.each(['light', 'dark'] as const)('%s appearance', theme => {
  describe.each(['normal', 'high'] as const)('%s contrast', contrast => {
    it.each(appNeutrals)('%s defines each exact colour and meets the contrast thresholds', tint => {
      const dark = theme === 'dark' ? '.theme-dark' : '';
      const base = { ...tokens(':root'), ...(dark ? tokens(':root.theme-dark') : {}) };
      const variant = tint === 'slate' ? {} : tokens(`:root[data-neutral="${tint}"]`);
      const high = contrast === 'high' ? {
        ...tokens(':root[data-contrast="high"]'),
        ...tokens(`:root${dark}${tint === 'slate' ? '' : `[data-neutral="${tint}"]`}[data-contrast="high"]`),
      } : {};
      const palette = { ...base, ...variant, ...high };
      const title = tint.charAt(0).toUpperCase() + tint.slice(1);
      const heading = contrast === 'high' ? 'High' : 'Normal';
      const section = spec.split(`## ${heading} contrast\n`)[1]?.split('\n## ')[0] ?? '';
      const rows = section.split(new RegExp(`\\n${title}(?: \\(hue \\d+\\))?:\\n`))[1]?.split('\n\n')[0] ?? '';
      const required = contrast === 'high' ? greyTokens : [...greyTokens, 'plot', ...selectionTokens];
      for (const token of required) {
        const match = new RegExp(`--${token}: (oklch\\([^)]+\\)) \\| (oklch\\([^)]+\\))`).exec(rows);
        const exact = match?.[theme === 'light' ? 1 : 2];
        if (!exact) throw new Error(`Missing tint value ${tint} ${token}`);
        expect(tuple(computedToken(`--${token}`, palette)), token).toEqual(tuple(exact));
      }
      const luminanceOf = (token: string) => luminance(tuple(computedToken(`--${token}`, palette)));
      expect(contrastRatio(luminanceOf('text'), luminanceOf('bg'))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(luminanceOf('text-muted'), luminanceOf('panel'))).toBeGreaterThanOrEqual(4.5);
      if (contrast === 'high') {
        expect(contrastRatio(luminanceOf('border'), luminanceOf('bg'))).toBeGreaterThanOrEqual(3);
        expect(computedToken('--plot', palette)).toBe(computedToken('--bg', palette));
        expect(computedToken('--accent', palette)).toBe(computedToken('--text', palette));
      }
    });
  });
});

it.each(['light', 'dark'] as const)('every sharpened trace has at least 4.5:1 contrast on every %s plot', theme => {
  const dark = theme === 'dark' ? '.theme-dark' : '';
  for (const tint of appNeutrals) {
    const variant = tint === 'slate' ? '' : `[data-neutral="${tint}"]`;
    const plot = tokens(`:root${dark}${variant}[data-contrast="high"]`)['--bg'];
    if (!plot) throw new Error(`Missing plot for ${tint}`);
    const background = luminance(tuple(plot));
    for (const [index, hue] of SOURCE_HUES.entries()) {
      for (const palette of ['standard', 'colour-blind'] as const) {
        const source = displayTraceColor({ palette: 'source', index, hue, round: 0 }, theme, palette, true);
        expect(contrastRatio(luminance(tuple(source)), background), `${tint} ${palette} ${source}`).toBeGreaterThanOrEqual(4.5);
        for (const createdHue of CREATED_HUES) {
          const created = displayTraceColor({ palette: 'created', index, cbIndex: index, hue: createdHue, round: 0 }, theme, palette, true);
          expect(contrastRatio(luminance(tuple(created)), background), `${tint} ${palette} ${created}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  }
});
