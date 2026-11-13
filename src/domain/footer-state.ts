/**
 * Footer wording that depends on app state (pure): what a click does now, the short trace name and the
 * mouse-position text. The mouse hints themselves live in shortcuts.ts, shared with Help.
 */
import { shortcutText } from './shortcuts';
import { nextLineLabel } from './ref-lines';
import type { Marker } from '../types/marker';
import type { RefLine } from '../types/ref-line';

/** What a click does while no tool is armed. */
export const IDLE_SENTENCE = 'Click: select · drag: move';

export type ArmedTone = 'marker' | 'lines';
export interface FooterSentence {
  readonly text: string;
  /** The armed tool's colour group (its button's hue); null when nothing is armed. */
  readonly tone: ArmedTone | null;
}

export interface SentenceInput {
  readonly armed: { readonly kind: 'normal' } | { readonly kind: 'delta'; readonly refId: string } | null;
  readonly refMode: 'h' | 'v' | null;
  readonly markers: readonly Pick<Marker, 'id' | 'type' | 'label'>[];
  readonly refLines: readonly RefLine[];
}

/** The name the marker list shows: its role label, else M or DM and its position. */
export function markerDisplayName(markers: readonly Pick<Marker, 'type' | 'label'>[], index: number): string {
  const marker = markers[index];
  return marker?.label || `${marker?.type === 'delta' ? 'DM' : 'M'}${index + 1}`;
}

/** "Placing DM2 (Δ from M1) · click a trace · Esc cancels", or the idle sentence. Lines win over markers, as in the toolbar. */
export function footerSentence({ armed, refMode, markers, refLines }: SentenceInput): FooterSentence {
  const cancel = `${shortcutText('escape')} cancels`;
  if (refMode) return { text: `Placing ${nextLineLabel(refMode, refLines)} · click the plot · ${cancel}`, tone: 'lines' };
  if (!armed) return { text: IDLE_SENTENCE, tone: null };
  if (armed.kind === 'delta') {
    const ref = markers.findIndex(marker => marker.id === armed.refId);
    const from = ref >= 0 ? ` (Δ from ${markerDisplayName(markers, ref)})` : '';
    return { text: `Placing DM${markers.length + 1}${from} · click a trace · ${cancel}`, tone: 'marker' };
  }
  return { text: `Placing M${markers.length + 1} · click a trace · ${cancel}`, tone: 'marker' };
}

/** At most `max` characters, ending in an ellipsis when cut. */
export function shortName(text: string, max = 16): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The trace for the footer: Touchstone labels start with the file name, so put the trace first ("S21 dB · chain.s2p") before cutting. */
export function shortTraceName(label: string, file: string | null | undefined, max = 16): string {
  const rest = file && label.startsWith(`${file} `) ? label.slice(file.length + 1) : null;
  return shortName(rest ? `${rest} · ${file}` : label, max);
}

/** "2.4370 GHz  −12.31 dB": X, two spaces, Y with a real minus sign. */
export function formatPointerXY(x: string, y: string): string {
  return `${x}  ${y.replace(/^-/, '−')}`;
}
