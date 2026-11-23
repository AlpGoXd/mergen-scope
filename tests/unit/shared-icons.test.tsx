// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
} from '../../src/components/shared/Icons';

describe('shared UI icons', () => {
  const icons = [
    ['CloseIcon', CloseIcon],
    ['CaretDownIcon', CaretDownIcon],
    ['CaretUpIcon', CaretUpIcon],
    ['ChevronLeftIcon', ChevronLeftIcon],
    ['ChevronRightIcon', ChevronRightIcon],
    ['ChevronUpIcon', ChevronUpIcon],
    ['CheckIcon', CheckIcon],
  ] as const;

  it.each(icons)('renders %s as an aria-hidden SVG using currentColor', (_name, Component) => {
    const { container, rerender } = render(<Component />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('width', '12');
    expect(svg).toHaveAttribute('height', '12');
    expect(svg?.querySelector('path')).not.toBeNull();

    rerender(<Component size={14} className="custom-icon" />);
    expect(svg).toHaveAttribute('width', '14');
    expect(svg).toHaveAttribute('height', '14');
    expect(svg).toHaveClass('ui-icon', 'custom-icon');
  });
});
