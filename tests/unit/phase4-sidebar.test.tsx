import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TouchstoneMatrixPicker } from '../../src/components/sidebar/TouchstoneMatrixPicker';
import { makeTraceColorResolver } from '../../src/domain/trace-colors';
import { makeTestTrace } from './helpers';

describe('Phase 4 sidebar controls', () => {
  it('shows large-port chips and a closable full grid', () => {
    const onToggle = vi.fn();
    render(<TouchstoneMatrixPicker portCount={12} family="S" view="dB" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /Grid/ }));
    expect(screen.getByRole('dialog', { name: 'Full parameter grid' })).toBeVisible();
    expect(screen.getByTestId('touchstone-cell-S123')).not.toHaveAttribute('aria-pressed');
    fireEvent.click(screen.getByTestId('touchstone-cell-S123'));
    expect(onToggle).toHaveBeenCalledWith(11, 2, 'dB');
    fireEvent.click(screen.getByRole('button', { name: 'Close grid' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('does not use sample arrays to assign a trace color', () => {
    const trace = makeTestTrace({ id: 't', name: 't' });
    const first = makeTraceColorResolver([trace], {}, 'light', {}, 'standard')(trace);
    const updated = { ...trace, data: [{ freq: 3, amp: 99 }] };
    expect(makeTraceColorResolver([updated], {}, 'light', { t: { palette: 'source', index: 0, round: 0, hue: 270 } }, 'standard')(updated)).toBe(first);
  });
});
