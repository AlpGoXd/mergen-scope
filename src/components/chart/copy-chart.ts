/**
 * Copy a pane's plot to the clipboard as a PNG, and download text. DOM helpers for the pane's
 * action row (Pane settings > Copy chart, Export…). No dependency: the plot is already SVG.
 */

/** Presentation properties that reach the image; class and variable based styles are resolved into them. */
const INLINED = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'visibility', 'display', 'paint-order', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
] as const;

function plotSvg(pane: HTMLElement): SVGSVGElement | null {
  let best: SVGSVGElement | null = null;
  let area = 0;
  for (const svg of pane.querySelectorAll<SVGSVGElement>('svg.recharts-surface, svg.smith-svg')) {
    const box = svg.getBoundingClientRect();
    if (box.width * box.height > area) { best = svg; area = box.width * box.height; }
  }
  return best;
}

function standalone(svg: SVGSVGElement, background: string): { markup: string; width: number; height: number } {
  const box = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width)), height = Math.max(1, Math.round(box.height));
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
  });
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${width} ${height}`);
  copy.style.position = 'static';
  const sheet = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  sheet.setAttribute('width', '100%'); sheet.setAttribute('height', '100%'); sheet.setAttribute('fill', background);
  copy.insertBefore(sheet, copy.firstChild);
  return { markup: new XMLSerializer().serializeToString(copy), width, height };
}

export type CopyChartResult = 'copied' | 'unsupported' | 'failed';

/** The pane's plot (grid, traces, markers and lines drawn in SVG) as a 2× PNG on the clipboard. */
export async function copyChartImage(pane: HTMLElement): Promise<CopyChartResult> {
  const svg = plotSvg(pane);
  if (!svg) return 'failed';
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return 'unsupported';
  try {
    const background = getComputedStyle(pane).getPropertyValue('--bg').trim() || 'white';
    const { markup, width, height } = standalone(svg, background);
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The chart could not be drawn')); image.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = width * 2; canvas.height = height * 2;
      const context = canvas.getContext('2d');
      if (!context) return 'failed';
      context.scale(2, 2);
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return 'failed';
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return 'failed';
  }
}

export function downloadText(fileName: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}
