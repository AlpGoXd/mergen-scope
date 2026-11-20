import { cssColorToRgb } from './export-png';
import { pdfPageSize } from '../../../domain/export-pdf';

export async function paperPdf(markup: string, preset: 'ieee-1' | 'ieee-2'): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const [, , width = 0, height = 0] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  if (!(width > 0 && height > 0)) throw new Error('The PDF has no page dimensions.');
  const physical = /^(\d+(?:\.\d+)?)mm$/.exec(svg.getAttribute('height') ?? '');
  const page = pdfPageSize(preset, width, height, physical ? Number(physical[1]) : undefined);

  for (const css of svg.querySelectorAll('style')) css.remove();
  flattenSvgViewports(svg);
  for (const node of svg.querySelectorAll<SVGElement>('*')) {
    preserveStrokeWidth(node, svg);
    const family = node.style.getPropertyValue('font-family') || node.getAttribute('font-family');
    if (family) {
      const standard = /mono|courier/i.test(family) ? 'courier' : /times|(^|[ ,])serif/i.test(family) ? 'times' : 'helvetica';
      node.style.setProperty('font-family', standard);
      const weight = node.style.getPropertyValue('font-weight') || node.getAttribute('font-weight') || '400';
      node.style.setProperty('font-weight', standard !== 'courier' && (Number(weight) >= 600 || weight === 'bold') ? '700' : '400');
    }
    for (const property of ['fill', 'stroke']) {
      const inline = node.style.getPropertyValue(property);
      const paint = inline || node.getAttribute(property);
      if (!paint || !/^(oklch|oklab|lab|lch|color|color-mix)\(/i.test(paint)) continue;
      const { r, g, b } = cssColorToRgb(paint, document.documentElement);
      node.style.setProperty(property, `rgb(${r},${g},${b})`);
    }
  }
  for (const node of svg.querySelectorAll<SVGTextContentElement>('text, tspan')) {
    if (node.classList.contains('smith-label')) {
      node.style.setProperty('stroke', 'none');
    }
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent = (child.textContent ?? '').replaceAll('−', '-').replaceAll('Ω', 'ohm').replaceAll('Γ', 'Gamma').replaceAll('Δ', 'Delta').replaceAll('×', 'x').replaceAll('∞', 'inf');
      }
    }
  }
  // Give svg2pdf dimensions in the same units as its viewport, then scale the viewBox into the page.
  svg.setAttribute('width', String(page.width));
  svg.setAttribute('height', String(page.height));
  const pdf = new jsPDF({
    unit: 'mm', format: [page.width, page.height], orientation: page.width >= page.height ? 'landscape' : 'portrait',
    putOnlyUsedFonts: true, compress: true,
  });
  await svg2pdf(svg, pdf, { x: 0, y: 0, width: page.width, height: page.height });
  return pdf.output('blob');
}

/** SVG2PDF does not apply vector-effect to a transformed Smith trace or grid. */
function preserveStrokeWidth(node: SVGElement, root: Element): void {
  if (node.style.getPropertyValue('vector-effect') !== 'non-scaling-stroke') return;
  let scale = 1;
  for (let element: Element | null = node; element && element !== root; element = element.parentElement) {
    if (!(element instanceof SVGGraphicsElement)) continue;
    const transforms = element.transform.baseVal;
    for (let i = 0; i < transforms.numberOfItems; i++) {
      const matrix = transforms.getItem(i).matrix;
      scale *= Math.hypot(matrix.a, matrix.b);
    }
  }
  const width = parseFloat(node.style.getPropertyValue('stroke-width'));
  if (!(scale > 0) || !Number.isFinite(width)) return;
  node.style.setProperty('stroke-width', String(width / scale));
  const dashes = node.style.getPropertyValue('stroke-dasharray');
  if (dashes && dashes !== 'none') {
    node.style.setProperty('stroke-dasharray', dashes.split(/[ ,]+/).filter(Boolean).map(value => String(parseFloat(value) / scale)).join(' '));
  }
  node.style.removeProperty('vector-effect');
}

/** svg2pdf treats nested SVG dimensions as PDF units. Convert our pixel viewports to transforms instead. */
function flattenSvgViewports(root: Element): void {
  for (const svg of root.querySelectorAll('svg')) {
    const x = Number(svg.getAttribute('x') ?? 0), y = Number(svg.getAttribute('y') ?? 0);
    const width = Number(svg.getAttribute('width')), height = Number(svg.getAttribute('height'));
    const [minX = 0, minY = 0, viewWidth = width, viewHeight = height] = (svg.getAttribute('viewBox') ?? '').trim().split(/\s+/).filter(Boolean).map(Number);
    const scale = Math.min(width / viewWidth, height / viewHeight);
    if (!Number.isFinite(scale) || scale <= 0) continue;
    const group = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    const tx = x + (width - viewWidth * scale) / 2 - minX * scale;
    const ty = y + (height - viewHeight * scale) / 2 - minY * scale;
    for (const { name, value } of [...svg.attributes]) {
      if (!['xmlns', 'x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'transform'].includes(name)) group.setAttribute(name, value);
    }
    group.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})${svg.getAttribute('transform') ? ' ' + svg.getAttribute('transform') : ''}`);
    group.append(...svg.childNodes);
    svg.replaceWith(group);
  }
}
