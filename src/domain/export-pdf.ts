import { IEEE_COLUMN_MM } from './export-image';

/** The width is the exact IEEE preset, independent of any rounding of the SVG viewBox in pixels. */
export function pdfPageSize(preset: 'ieee-1' | 'ieee-2', svgWidth: number, svgHeight: number, physicalHeight?: number) {
  const width = IEEE_COLUMN_MM[preset];
  return { width, height: physicalHeight ?? width * svgHeight / svgWidth };
}
