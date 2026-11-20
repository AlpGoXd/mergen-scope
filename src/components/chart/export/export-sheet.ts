import { ptToCssPx } from '../../../domain/export-image';
import type { ExportBox, ExportDocumentOptions, ExportGeometry } from '../../../domain/export-document';
import { exportFontFamily, SCREEN_FONT_PX } from './export-theme';
import { embeddedFontCss } from './export-svg';

const NS = 'http://www.w3.org/2000/svg';

export interface SheetPane { readonly box: ExportBox; readonly svg: string | null }

export function sheetLayout(options: ExportDocumentOptions, geometry: ExportGeometry, markerRows: readonly string[], title: string, date: string) {
  const { cssWidth: width, cssHeight: height, paper } = geometry;
  const font = paper ? ptToCssPx(options.paperText) : SCREEN_FONT_PX;
  const fontFamily = exportFontFamily(paper, options.paperFont);
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) ctx.font = `${font}px ${fontFamily}`;
  const measure = (label: string) => ctx?.measureText(label).width ?? label.length * font * 0.6;
  const fit = (text: string, max: number) => {
    if (measure(text) <= max) return text;
    let low = 0, high = text.length;
    while (high - low > 1) {
      const next = (high + low) >> 1;
      if (measure(text.slice(0, next) + '…') <= max) low = next;
      else high = next;
    }
    return text.slice(0, low) + '…';
  };
  const gap = Math.round(font * 0.55);
  const row = Math.round(font * 1.55);
  const header = title || date ? row + gap : 0;
  const rows = markerRows.slice(0, Math.max(0, Math.floor(height * 0.24 / row) - 1));
  if (rows.length < markerRows.length) rows.push(`${markerRows.length - rows.length} more markers`);
  const markers = rows.map(text => fit(text, width - 2 * gap));
  return { font, fontFamily, gap, row, title: fit(title, width - gap * 3 - measure(date)), date, header, markers, plotHeight: Math.max(40, height - header - markers.length * row) };
}

function element<K extends keyof SVGElementTagNameMap>(parent: SVGElement, tag: K, attributes: Record<string, string | number>, content?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (content !== undefined) node.textContent = content;
  parent.append(node);
  return node;
}

export async function composeSheet(input: {
  readonly geometry: ExportGeometry & { fileWidth: string; fileHeight: string };
  readonly layout: ReturnType<typeof sheetLayout>;
  readonly panes: readonly SheetPane[];
  readonly background: string;
  readonly ink: string;
  readonly border: string;
  readonly embedFonts: boolean;
}): Promise<string> {
  const { geometry, layout, panes, background, ink, border } = input;
  const { cssWidth: width, cssHeight: height } = geometry;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', geometry.fileWidth);
  svg.setAttribute('height', geometry.fileHeight);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  element(svg, 'rect', { width, height, fill: background });
  for (const { box, svg: pane } of panes) {
    if (pane === null) continue;
    const root = new DOMParser().parseFromString(pane, 'image/svg+xml').documentElement;
    if (root.localName !== 'svg') throw new Error('A pane did not produce a valid SVG.');
    root.setAttribute('x', String(box.x));
    root.setAttribute('y', String(box.y));
    root.setAttribute('width', String(box.width));
    root.setAttribute('height', String(box.height));
    svg.append(document.importNode(root, true));
  }
  const decorate = element(svg, 'g', { fill: ink, 'font-family': layout.fontFamily, 'font-size': layout.font });
  if (layout.title) element(decorate, 'text', { x: layout.gap, y: layout.row, 'font-weight': 600 }, layout.title);
  if (layout.date) element(decorate, 'text', { x: width - layout.gap, y: layout.row, 'text-anchor': 'end' }, layout.date);
  const markerTop = layout.header + layout.plotHeight;
  if (layout.markers.length) {
    element(decorate, 'line', { x1: layout.gap, x2: width - layout.gap, y1: markerTop, y2: markerTop, stroke: border });
    layout.markers.forEach((row, index) => element(decorate, 'text', { x: layout.gap, y: markerTop + (index + 0.8) * layout.row }, row));
  }
  const serializer = new XMLSerializer();
  if (input.embedFonts) {
    const fonts = await embeddedFontCss(serializer.serializeToString(svg));
    if (fonts) element(svg, 'style', {}, fonts);
  }
  return serializer.serializeToString(svg);
}
