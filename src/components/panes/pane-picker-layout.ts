// Pure layout rule for the empty-pane picker (design board P9). No React: unit-tested on its own.
// The picker measures its own box (the pane body, not the window) and asks this for a size step.

export type PickerSize = 'L' | 'M' | 'S' | 'I';
export interface PickerLayout { readonly size: PickerSize; readonly cols: 2 | 3 }

/**
 * L  w ≥ 640 and h ≥ 400  large tiles: icon 24, name, one-line description, heading + sub line
 * M  w ≥ 360 and h ≥ 300  medium tiles: icon 22 and name, heading only
 * S  w ≥ 300 and h ≥ 150  small buttons: icon 16 and name on one line, one short lead line
 * I  anything smaller     icon-only buttons, the name in a tooltip
 * Always 3 columns × 2 rows, except tall narrow boxes (w < 300, h ≥ 300): small buttons in 2 columns × 3 rows.
 */
export function pickerLayout(width: number, height: number): PickerLayout {
  if (width < 300 && height >= 300) return { size: 'S', cols: 2 };
  if (width >= 640 && height >= 400) return { size: 'L', cols: 3 };
  if (width >= 360 && height >= 300) return { size: 'M', cols: 3 };
  if (width >= 300 && height >= 150) return { size: 'S', cols: 3 };
  return { size: 'I', cols: 3 };
}
