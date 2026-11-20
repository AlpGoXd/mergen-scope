/**
 * Turn the offscreen export render into one standalone SVG: styles inlined, fonts embedded, background drawn.
 * DOM helpers only; the geometry comes from domain/export-image.
 */

import { placeExportLabels } from '../../../domain/export-plot';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Presentation properties that reach the image; class and variable based styles are resolved into them. */
const INLINED = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'opacity', 'visibility', 'display', 'paint-order', 'vector-effect', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline',
] as const;

/** A copy of `svg` whose every element carries its computed presentation styles; no `var(...)` remains. */
function inlinedClone(svg: SVGSVGElement): SVGSVGElement {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const live = [svg, ...svg.querySelectorAll<SVGElement>('*')];
  const cloned = [copy, ...copy.querySelectorAll<SVGElement>('*')];
  live.forEach((element, index) => {
    const target = cloned[index];
    if (!target) return;
    const computed = getComputedStyle(element);
    for (const property of INLINED) {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    }
    // The inline style now holds the resolved value; an attribute still naming a variable would be invalid outside the app.
    for (const attribute of [...target.attributes]) if (attribute.value.includes('var(')) target.removeAttribute(attribute.name);
  });
  return copy;
}

export interface PaperMarkerTag { dx: number; dy: number; text: string }

function placePaperMarkers(live: SVGSVGElement, copy: SVGSVGElement, width: number, height: number, tags: Record<string, PaperMarkerTag>): boolean {
  const plot = live.querySelector('clipPath rect');
  const left = Number(plot?.getAttribute('x') ?? 0), top = Number(plot?.getAttribute('y') ?? 0);
  const plotWidth = Number(plot?.getAttribute('width') ?? width), plotHeight = Number(plot?.getAttribute('height') ?? height);
  const labels = [...live.querySelectorAll<SVGTextElement>('[data-paper-marker-label]')].map(node => ({
    bounds: node.getBBox(), x: Number(node.dataset.anchorX), y: Number(node.dataset.anchorY),
  }));
  const positions = placeExportLabels(labels.map(({ bounds, x, y }) => ({ x: x - left, y: y - top, width: bounds.width, height: bounds.height })), plotWidth, plotHeight)
    .map(box => box && { ...box, x: box.x + left, y: box.y + top });
  [...copy.querySelectorAll<SVGTextElement>('[data-paper-marker-label]')].forEach((node, index) => {
    const position = positions[index];
    const label = labels[index];
    const leader = node.parentElement?.querySelector('[data-paper-marker-leader]');
    if (!position || !label) {
      leader?.remove();
      node.remove();
      return;
    }
    const sourceX = Number(node.getAttribute('x'));
    const sourceY = Number(node.getAttribute('y'));
    node.setAttribute('x', String(sourceX + position.x - label.bounds.x));
    node.setAttribute('y', String(sourceY + position.y - label.bounds.y));
    const endX = Math.max(position.x, Math.min(position.x + position.width, label.x));
    const endY = label.y < position.y ? position.y : position.y + position.height;
    leader?.setAttribute('x1', String(endX));
    leader?.setAttribute('y1', String(endY));
    leader?.setAttribute('x2', String(label.x));
    leader?.setAttribute('y2', String(label.y));
    leader?.setAttribute('stroke-width', '0.6');
    (leader as SVGElement | null)?.style.setProperty('stroke-width', '0.6');
    const text = node.textContent ?? '';
    const id = /^(DM|M)\d+/.exec(text)?.[0];
    if (id) tags[id] = { dx: position.x + position.width / 2 - label.x, dy: position.y + position.height / 2 - label.y, text };
  });
  return positions.some(position => position === null);
}

const fontCache = new Map<string, Promise<string | null>>();

function toDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return Promise.resolve(url);
  let pending = fontCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(response => response.ok ? response.blob() : Promise.reject(new Error(String(response.status))))
      .then(blob => new Promise<string | null>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null); reader.onerror = () => resolve(null); reader.readAsDataURL(blob); }))
      .catch(() => null);
    fontCache.set(url, pending);
  }
  return pending;
}

/** @font-face rules (with data URLs) for the app fonts the image uses. A font that cannot be read is skipped. */
export async function embeddedFontCss(markup: string): Promise<string> {
  const rules: Promise<string | null>[] = [];
  for (const sheet of [...document.styleSheets]) {
    let cssRules: CSSRuleList;
    try { cssRules = sheet.cssRules; } catch { continue; }
    for (const rule of [...cssRules]) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      if (!family || !markup.includes(family)) continue;
      const src = rule.style.getPropertyValue('src');
      const match = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(src);
      if (!match?.[1]) continue;
      const url = new URL(match[1], sheet.href ?? document.baseURI).href;
      const weight = rule.style.getPropertyValue('font-weight') || '400';
      const style = rule.style.getPropertyValue('font-style') || 'normal';
      rules.push(toDataUrl(url).then(data => data ? `@font-face{font-family:"${family}";src:url(${data});font-weight:${weight};font-style:${style};}` : null));
    }
  }
  return (await Promise.all(rules)).filter((rule): rule is string => rule !== null).join('');
}

export interface ComposeInput {
  /** The offscreen container (its box is the image). */
  readonly host: HTMLElement;
  /** The SVG layers inside the host, in paint order (chart, then legend). */
  readonly layers: readonly SVGSVGElement[];
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** Width and height of the downloadable SVG (mm for paper sizes, px for the pane size). */
  readonly fileWidth: string;
  readonly fileHeight: string;
  readonly embedFonts?: boolean;
}

export interface ComposedSvg {
  /** Sized in device pixels: what the PNG rasteriser draws. */
  readonly raster: string;
  /** The same drawing sized physically: the downloaded .svg file. */
  readonly file: string;
  readonly markerOverflow: boolean;
  readonly markerTags: Record<string, PaperMarkerTag>;
}

/** One standalone SVG of the host: CSS-px viewBox, pixel width/height, so it rasterises as vectors at the final size. */
export async function composeExportSvg({ host, layers, cssWidth, cssHeight, pixelWidth, pixelHeight, fileWidth, fileHeight, embedFonts = true }: ComposeInput): Promise<ComposedSvg> {
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('width', String(pixelWidth));
  root.setAttribute('height', String(pixelHeight));
  root.setAttribute('viewBox', `0 0 ${cssWidth} ${cssHeight}`);
  const defs = document.createElementNS(SVG_NS, 'defs');
  root.appendChild(defs);
  const sheet = document.createElementNS(SVG_NS, 'rect');
  sheet.setAttribute('width', String(cssWidth)); sheet.setAttribute('height', String(cssHeight));
  sheet.setAttribute('fill', getComputedStyle(host).getPropertyValue('--bg').trim() || '#ffffff');
  root.appendChild(sheet);
  const origin = host.getBoundingClientRect();
  let markerOverflow = false;
  const markerTags: Record<string, PaperMarkerTag> = {};
  for (const layer of layers) {
    const box = layer.getBoundingClientRect();
    const copy = inlinedClone(layer);
    markerOverflow = placePaperMarkers(layer, copy, box.width, box.height, markerTags) || markerOverflow;
    copy.removeAttribute('class');
    copy.style.removeProperty('position');
    copy.setAttribute('x', String(Math.round(box.left - origin.left)));
    copy.setAttribute('y', String(Math.round(box.top - origin.top)));
    copy.setAttribute('width', String(Math.max(1, Math.round(box.width))));
    copy.setAttribute('height', String(Math.max(1, Math.round(box.height))));
    if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${Math.max(1, Math.round(box.width))} ${Math.max(1, Math.round(box.height))}`);
    root.appendChild(copy);
  }
  const fonts = embedFonts ? await embeddedFontCss(new XMLSerializer().serializeToString(root)) : '';
  if (fonts) {
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = fonts;
    defs.appendChild(style);
  }
  const raster = new XMLSerializer().serializeToString(root);
  root.setAttribute('width', fileWidth);
  root.setAttribute('height', fileHeight);
  return { raster, file: `<?xml version="1.0" encoding="UTF-8"?>
${new XMLSerializer().serializeToString(root)}`, markerOverflow, markerTags };
}
