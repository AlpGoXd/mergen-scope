// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';
import { useChartHover } from '../../src/hooks/use-chart-hover';
import { PointerReadoutProvider, usePointerReadout } from '../../src/stores/pointer-readout-store';
import { SharedHoverProvider, useSharedHover } from '../../src/stores/shared-hover-store';
import { makeTestTrace } from './helpers';

const frequencyTrace = makeTestTrace();
const timeTrace = makeTestTrace({ domain: 'time', units: { x: 's', y: 'V' } });
const options = {
  paneId: 'active',
  paneTraces: [frequencyTrace],
  activeTrace: frequencyTrace,
  visibleXSpan: 20,
  resolveTraceColor: () => 'red',
  isExport: false,
  isSmith: false,
};

function Providers({ children }: { children: ReactNode }) {
  return <SharedHoverProvider><PointerReadoutProvider>{children}</PointerReadoutProvider></SharedHoverProvider>;
}

it('shows the local cursor, shares with matching panes, and clears the footer on leave', () => {
  const { result } = renderHook(() => ({
    active: useChartHover(options),
    matching: useChartHover({ ...options, paneId: 'matching' }),
    time: useChartHover({ ...options, paneId: 'time', paneTraces: [timeTrace] }),
    smith: useChartHover({ ...options, paneId: 'smith', isSmith: true }),
    readout: usePointerReadout(),
  }), { wrapper: Providers });

  act(() => result.current.active.updateHover(10, () => -4));
  expect(result.current.active.crosshairX).toBe(10);
  expect(result.current.active.ghostCrosshairX).toBeNull();
  expect(result.current.active.hoverRows).toMatchObject([
    { placement: { freq: 10, amp: 10 }, color: 'red', resolutionLabel: 'snap' },
  ]);
  expect(result.current.matching.ghostCrosshairX).toBe(10);
  expect(result.current.time.ghostCrosshairX).toBeNull();
  expect(result.current.smith.ghostCrosshairX).toBeNull();
  expect(result.current.readout).toContain('−4.00 dBm');

  const previousReadout = result.current.readout;
  act(() => result.current.active.updateHover(20, () => null));
  expect(result.current.matching.ghostCrosshairX).toBe(20);
  expect(result.current.readout).toBe(previousReadout);

  act(() => result.current.active.clearHover());
  expect(result.current.active.crosshairX).toBeNull();
  expect(result.current.active.hoverRows).toEqual([]);
  expect(result.current.matching.ghostCrosshairX).toBeNull();
  expect(result.current.readout).toBeNull();
});

it('keeps the real pane hover when an export copy changes its pane ID', () => {
  const { result, rerender } = renderHook(({ exportId }) => ({
    active: useChartHover(options),
    exported: useChartHover({ ...options, paneId: exportId, isExport: true }),
    shared: useSharedHover(),
    readout: usePointerReadout(),
  }), { wrapper: Providers, initialProps: { exportId: 'active' } });

  act(() => result.current.active.updateHover(10, () => -4));
  const previousReadout = result.current.readout;
  rerender({ exportId: 'other' });
  expect(result.current.exported.ghostCrosshairX).toBeNull();
  expect(result.current.shared).toEqual({ paneId: 'active', value: 10, xUnit: 'Hz' });
  expect(result.current.readout).toBe(previousReadout);
});
