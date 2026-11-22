import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

function tokens(rule: string): Record<string, string> {
  const start = css.indexOf(`${rule} {`);
  if (start < 0) throw new Error(`Missing CSS rule ${rule}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(Array.from(body.matchAll(/(--[\w-]+):\s*([^;]+);/g), match => [match[1], match[2]]));
}

function computedToken(name: string, palette: Record<string, string>): string {
  const value = palette[name];
  if (value === undefined) throw new Error(`Missing CSS token ${name}`);
  return value
    .replace(/var\((--[\w-]+)\)/g, (_, token: string) => computedToken(token, palette))
    .replace(/calc\(([\d.]+)\s*\*\s*([\d.]+)\)/g, (_, left: string, right: string) => String(Number(left) * Number(right)));
}

function luminance(colour: string): number {
  const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(colour);
  if (!parts) throw new Error(`Expected OKLCH, got ${colour}`);
  const lightness = Number(parts[1]);
  const chroma = Number(parts[2]);
  const hue = Number(parts[3]) * Math.PI / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  // Convert OKLab to linear sRGB, which is already linearized for WCAG luminance.
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

const slate = tokens(':root, .export-tokens');
const tints = [
  { name: 'Slate', overrides: {} },
  { name: 'Stone', overrides: tokens(':root[data-neutral="stone"]') },
  { name: 'Zinc', overrides: tokens(':root[data-neutral="zinc"]') },
];

describe.each([
  { theme: 'light', overrides: {} },
  { theme: 'dark', overrides: tokens('.theme-dark') },
])('$theme neutral contrast', ({ overrides }) => {
  it.each(tints)('$name keeps each text/surface pair at 4.5:1 or better', tint => {
    const palette = { ...slate, ...overrides, ...tint.overrides };
    for (const [text, surface] of [['--text', '--bg'], ['--text-muted', '--panel'], ['--text', '--raised']] as const) {
      const textLuminance = luminance(computedToken(text, palette));
      const surfaceLuminance = luminance(computedToken(surface, palette));
      const ratio = (Math.max(textLuminance, surfaceLuminance) + 0.05) / (Math.min(textLuminance, surfaceLuminance) + 0.05);
      expect(ratio, `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
