import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditableValue, stepNumericText } from '../../src/components/shared/EditableValue';
import { rangeParts } from '../../src/domain/smith/range';

describe('stepNumericText', () => {
  it('bumps the last shown digit and keeps the unit', () => {
    expect(stepNumericText('2.450 GHz', 1)).toBe('2.451 GHz');
    expect(stepNumericText('2.450 GHz', -1)).toBe('2.449 GHz');
    expect(stepNumericText('2.450 GHz', 1, true)).toBe('2.460 GHz');
    expect(stepNumericText('100 Hz', -1)).toBe('99 Hz');
    expect(stepNumericText('-3.0 dB', 1)).toBe('-2.9 dB');
    expect(stepNumericText('+12.00 MHz', 1)).toBe('+12.01 MHz');
    expect(stepNumericText('0.999', 1)).toBe('1.000');
    expect(stepNumericText('no number', 1)).toBeNull();
  });
});

describe('EditableValue', () => {
  const setup = (onCommit = vi.fn<(text: string) => string | null>(() => null)) => {
    render(<EditableValue label="M1 position" value="2.450 GHz" onCommit={onCommit} testId="value" />);
    return onCommit;
  };

  it('is plain text at rest and a field after a click', () => {
    setup();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'M1 position' }));
    expect(screen.getByRole('textbox', { name: 'M1 position' })).toHaveValue('2.450 GHz');
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('saves on Enter and on blur, and does nothing when the text is unchanged', () => {
    const commit = setup();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2.5 GHz' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(commit).toHaveBeenLastCalledWith('2.5 GHz');
    expect(screen.getByRole('button', { name: 'M1 position' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2.6 GHz' } });
    fireEvent.blur(screen.getByRole('textbox'));
    expect(commit).toHaveBeenLastCalledWith('2.6 GHz');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('cancels on Esc without saving', () => {
    const commit = setup();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '9 GHz' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'M1 position' })).toHaveTextContent('2.450 GHz');
  });

  it('steps with the arrow keys', () => {
    setup();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowUp' });
    expect(screen.getByRole('textbox')).toHaveValue('2.451 GHz');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown', shiftKey: true });
    expect(screen.getByRole('textbox')).toHaveValue('2.441 GHz');
  });

  it('keeps the old value and shows a caption message when the text is refused', () => {
    const commit = setup(vi.fn(() => 'Not a value. Try 2.450 GHz'));
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(commit).toHaveBeenCalledWith('abc');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Not a value. Try 2.450 GHz');
    expect(screen.getByRole('alert')).toHaveClass('t-caption');
    // Typing clears the message; leaving the field with refused text restores the old value.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abcd' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(screen.getByRole('textbox'));
    expect(screen.getByRole('button', { name: 'M1 position' })).toHaveTextContent('2.450 GHz');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('cannot be edited when disabled', () => {
    render(<EditableValue label="Range start" value="1 GHz" disabled onCommit={() => null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Range start' }));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('rangeParts', () => {
  it('gives each value its own unit', () => {
    expect(rangeParts({ startHz: 7.324e9, stopHz: 8.5e9 }, { startHz: 1e4, stopHz: 8.5e9 })).toEqual({ start: '7.324 GHz', stop: '8.500 GHz', full: '10 kHz–8.5 GHz' });
  });
});
