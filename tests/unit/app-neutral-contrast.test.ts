import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appNeutrals } from '../../src/components/settings/app-preferences';

const css = readFileSync(new URL('../../src/appearance-colours.css', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../../docs/design/colour-values.md', import.meta.url), 'utf8');
const names = { bg: 'bg', panel: 'panel', raised: 'raised', border: 'border', strong: 'border-strong', text: 'text', muted: 'text-muted' } as const;
type Name = keyof typeof names;

function tokens(rule: string, last = false): Record<string, string> {
  const marker = `${rule} {`;
  const lines = css.split('\n');
  const start = last ? lines.lastIndexOf(marker) : lines.indexOf(marker);
  if (start < 0) throw new Error(`Missing CSS rule ${rule}`);
  const body = lines.slice(start + 1).join('\n').split('}')[0] ?? '';
  return Object.fromEntries(Array.from(body.matchAll(/(--[\w-]+):\s*([^;]+);/g), match => [match[1], match[2]]));
}

function computedToken(name: string, palette: Record<string, string>): string {
  const value = palette[name];
  if (value === undefined) throw new Error(`Missing CSS token ${name}`);
  return value
    .replace(/var\((--[\w-]+)\)/g, (_, token: string) => computedToken(token, palette))
    .replace(/calc\(([\d.]+)\s*\/\s*2\)/g, (_, chroma: string) => String(Number(chroma) / 2));
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

describe.each(['light', 'dark'] as const)('%s appearance', theme => {
  describe.each(['normal', 'high'] as const)('%s contrast', contrast => {
    it.each(appNeutrals)('%s matches the decided colours and contrast thresholds', tint => {
      const dark = theme === 'dark' ? '.theme-dark' : '';
      const base = tokens(`:root${dark}, .export-tokens${dark}`);
      const variant = tint === 'slate' ? {} : tokens(`:root${dark}[data-neutral="${tint}"]`);
      const high = contrast === 'high' ? tokens(`:root${dark}[data-contrast="high"]`) : {};
      const palette = { ...base, ...variant, ...tokens(':root, .export-tokens', true), ...high };
      const title = tint.charAt(0).toUpperCase() + tint.slice(1);
      const rows = spec.split(`\n${title}:\n`)[1]?.split('\n').slice(0, 7).join('\n') ?? '';
      const values = {} as Record<Name, number>;
      for (const [label, token] of Object.entries(names) as [Name, string][]) {
        const match = new RegExp(`--${label}: light (oklch\\([^)]+\\)) \\| dark (oklch\\([^)]+\\))`).exec(rows);
        const exact = match?.[theme === 'light' ? 1 : 2];
        if (!exact) throw new Error(`Missing tint value ${tint} ${token}`);
        const expected = tuple(exact);
        if (contrast === 'high') {
          const lightness = new RegExp(`--${label}: light L ([\\d.]+) \\| dark L ([\\d.]+)`).exec(spec);
          expected[0] = Number(lightness?.[theme === 'light' ? 1 : 2]);
          expected[1] /= 2;
        }
        const actual = tuple(computedToken(`--${token}`, palette));
        expect(actual, token).toEqual(expected);
        values[label] = luminance(actual);
      }
      expect(contrastRatio(values.text, values.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(values.muted, values.panel)).toBeGreaterThanOrEqual(4.5);
      if (contrast === 'high') expect(contrastRatio(values.border, values.bg)).toBeGreaterThanOrEqual(3);
    });
  });
});
