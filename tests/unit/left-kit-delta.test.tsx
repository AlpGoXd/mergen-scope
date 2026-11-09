import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MarkerItem } from '../../src/components/sidebar/LiveMarkerItem';
import type { Marker } from '../../src/types/marker';

it('edits a signed delta offset relative to its reference', () => {
  const reference: Marker = { id: 'm1', freq: 2.4e9, amp: 0, trace: 't', type: 'normal', label: 'M1', refId: null, interpolated: false };
  const delta: Marker = { ...reference, id: 'm2', freq: 2.412e9, type: 'delta', label: 'D2', refId: 'm1' };
  const update = vi.fn();
  render(<MarkerItem marker={delta} index={1} trace={null} traceColor="#ff0000" xSpan={1e9} isSelected={false} paneNumber={1} refMarker={reference} allMarkers={[reference, delta]} onSelect={() => {}} onRemove={() => {}} onUpdateFreq={update} />);
  const input = screen.getByRole('textbox', { name: 'D2 position' });
  expect((input as HTMLInputElement).value).toContain('+');
  fireEvent.change(input, { target: { value: '-20 MHz' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(update).toHaveBeenCalledWith(2.38e9);
});
