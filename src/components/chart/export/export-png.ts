/** Rasterise a standalone SVG onto a canvas of exactly `pixelWidth × pixelHeight` and return a PNG. */
export async function svgToPng(svg: string, pixelWidth: number, pixelHeight: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The chart could not be drawn.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth; canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw images.');
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The image is too large for this browser.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let colorContext: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour (oklch, hex, a variable on `scope`) as sRGB 0–255, as the browser paints it. */
export function cssColorToRgb(color: string, scope: Element): { r: number; g: number; b: number } {
  const resolved = color.startsWith('var(') ? getComputedStyle(scope).getPropertyValue(color.slice(4, -1).split(',')[0]?.trim() ?? '').trim() : color;
  if (colorContext === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    colorContext = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!colorContext) return { r: 0, g: 0, b: 0 };
  colorContext.clearRect(0, 0, 1, 1);
  colorContext.fillStyle = '#000000';
  colorContext.fillStyle = resolved || '#000000';
  colorContext.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = colorContext.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}
