// OKLCH hue (degrees) of a CSS colour string, for kit components that colour by hue. Pure, no DOM.
// Understands oklch(L C H), #rgb, #rrggbb and rgb(r g b) / rgb(r, g, b); anything else returns null.

const srgbToLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function hueOfRgb(r: number, g: number, b: number): number | null {
  const [lr, lg, lb] = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  if (Math.hypot(a, bb) < 1e-4) return null; // grey: no hue
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}

export function oklchHue(color: string): number | null {
  const text = color.trim().toLowerCase();
  const oklch = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+(-?[\d.]+)(?:deg)?\s*(?:\/[^)]*)?\)$/.exec(text);
  if (oklch) { const h = Number(oklch[1]); return Number.isFinite(h) ? ((h % 360) + 360) % 360 : null; }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const raw = hex[1] ?? '';
    const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
    return hueOfRgb(parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16));
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(text);
  if (rgb) return hueOfRgb(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  return null;
}
