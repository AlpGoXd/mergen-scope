import type { Complex } from './touchstone.ts';
import type { Marker } from './marker.ts';

/** All dimensions and positions are CSS pixels; G has +imaginary upwards. */
export interface SmithViewport {
  readonly width: number;
  readonly height: number;
  readonly center: Complex;
  /** Pixels per unit G, identical on both axes. */
  readonly scale: number;
}
export interface SmithSample { readonly frequencyHz: number; readonly gamma: Complex }
export interface SmithTrace {
  /** Stable pane-model trace identity, never derived from samples. */
  readonly traceId: string;
  readonly color: string;
  readonly samples: readonly SmithSample[];
}
export interface SmithPlot {
  readonly viewport: SmithViewport;
  readonly traces: readonly SmithTrace[];
  readonly markers: readonly Marker[];
  readonly grid: 'z' | 'y' | 'both';
  readonly labels: boolean;
  readonly readout: readonly ('z' | 'y' | 'gamma' | 'vswr' | 'return-loss')[];
  readonly direction: 'chevrons' | 'ends' | 'off';
  readonly export: { readonly includeMarkers: boolean; readonly includeNames: boolean };
}
export interface SmithPoint { readonly x: number; readonly y: number }
/** Pixel positions for cursor-centered zoom and pan; fit never changes linked frequency. */
export type SmithInteraction =
  | { readonly kind: 'zoom'; readonly anchor: SmithPoint; readonly factor: number }
  | { readonly kind: 'pan'; readonly delta: SmithPoint }
  | { readonly kind: 'fit' };
