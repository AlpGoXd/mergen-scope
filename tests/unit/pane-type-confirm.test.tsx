import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PaneTypeMenu } from '../../src/components/panes/PaneTypeMenu';
import { PICKER_TILES } from '../../src/components/panes/PaneTypePicker';
import { useState } from 'react';

it('cancels the inline confirmation without applying a type change', () => {
  const confirm = vi.fn();
  function Example() {
    const [pending, setPending] = useState(true);
    return <PaneTypeMenu paneName="Pane 1" current="chart" tiles={PICKER_TILES}
      pending={pending ? { to: 'smith', toLabel: 'Smith', leaving: ['S21'], destination: null } : undefined}
      onChoose={() => {}} onConfirm={confirm} onCancel={() => setPending(false)} />;
  }
  render(<Example />);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('S21');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Chart' })).toHaveAttribute('aria-checked', 'true');
  expect(confirm).not.toHaveBeenCalled();
});
