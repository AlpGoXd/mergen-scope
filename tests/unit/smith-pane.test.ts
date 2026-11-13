import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmithPane } from '../../src/components/smith/SmithPane';
import type { SmithPaneProps, SmithPaneTrace } from '../../src/components/smith/SmithPane';
import type { Marker } from '../../src/types/marker';

// Γ of 25 Ω, 50 Ω and 50 + j50 Ω on 50 Ω.
const s11: SmithPaneTrace = {
  traceId: 's11', name: 'board.s2p · S11', shortName: 'S11', color: 'rgb(200, 0, 0)', z0: 50,
  samples: [
    { frequencyHz: 1e9, gamma: { re: -1 / 3, im: 0 } },
    { frequencyHz: 1.5e9, gamma: { re: 0, im: 0 } },
    { frequencyHz: 2e9, gamma: { re: 0.2, im: 0.4 } },
  ],
};
const created: SmithPaneTrace = {
  traceId: 'f1', name: 'f S22', color: 'rgb(0, 0, 200)', created: true, z0: 50,
  samples: [{ frequencyHz: 1e9, gamma: { re: 0, im: -0.5 } }, { frequencyHz: 2e9, gamma: { re: 0.5, im: -0.5 } }],
};
const marker = (id: string, freq: number, extra: Partial<Marker> = {}): Marker =>
  ({ id, freq, amp: 0, trace: s11.name, type: 'normal', label: null, refId: null, interpolated: false, ...extra });
const size = { width: 600, height: 400 };
const show = (props: Partial<SmithPaneProps> = {}) => render(createElement(SmithPane, { traces: [s11, created], size, ...props }));
const field = (name: string) => screen.getByTestId('smith-readout').querySelector(`[data-field="${name}"]`)?.textContent;
const scaleOf = () => Number(/scale\(([\d.]+)\)/.exec(screen.getByTestId('smith-plot').querySelector('svg > g')?.getAttribute('transform') ?? '')?.[1]);

describe('SmithPane', () => {
  it('draws the impedance grid and each trace in its colour and width', () => {
    show();
    expect(screen.getByTestId('smith-grid-z').querySelectorAll('path').length).toBeGreaterThan(8);
    expect(screen.queryByTestId('smith-grid-y')).toBeNull();
    const source = screen.getByTestId('smith-trace-s11'), made = screen.getByTestId('smith-trace-f1');
    expect(source.getAttribute('stroke')).toBe('rgb(200, 0, 0)');
    expect(source.getAttribute('stroke-width')).toBe('1.5');
    expect(made.getAttribute('stroke-width')).toBe('2');
    expect(source.querySelector('path')?.getAttribute('d')).toBe('M-0.3333333,0L0,0L0.2,-0.4');
    expect(source.querySelector('path')?.getAttribute('stroke-dasharray')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Smith chart: S11, f S22');
  });

  it('adds the admittance grid on request', () => {
    show({ grid: 'both' });
    expect(screen.getByTestId('smith-grid-z')).toBeInTheDocument();
    expect(screen.getByTestId('smith-grid-y').classList.contains('is-secondary')).toBe(true);
  });

  it('draws the linked band in full colour and the rest faint', () => {
    show({ traces: [s11], band: { minHz: 1.25e9, maxHz: 1.75e9 } });
    const paths = [...screen.getByTestId('smith-trace-s11').querySelectorAll('path')];
    expect(paths.map(path => path.classList.contains('is-faint'))).toEqual([true, false, true]);
  });

  it('shows the selected marker in the readout strip', () => {
    show({ markers: [marker('a', 1e9), marker('b', 2e9)], selectedMarkerId: 'b' });
    expect(field('marker')).toBe('M2S11');
    expect(field('frequency')).toBe('2.0000 GHz');
    expect(field('z')).toBe('Z50.00 + j50.00 Ω');
    expect(field('gamma')).toBe('Γ0.447 ∠ 63.4°');
    expect(field('vswr')).toBe('VSWR2.62');
    expect(field('equivalent')).toBe('L3.979 nH');
    expect(screen.getByTestId('smith-marker-b').classList.contains('is-selected')).toBe(true);
    expect(screen.getByTestId('smith-marker-b').textContent).toBe('M2 2.0000 GHz');
    expect(screen.getByTestId('smith-marker-a').textContent).toBe('M1');
  });

  it('follows the Readout setting and interpolates a marker between samples', () => {
    show({ markers: [marker('a', 1.25e9)], selectedMarkerId: 'a', readout: ['y', 'return-loss'] });
    expect(field('z')).toBeUndefined();
    expect(field('vswr')).toBeUndefined();
    // Halfway between Γ = −1/3 and 0 is Γ = −1/6: Z = 50 · (5/6)/(7/6) Ω, so Y = 28 mS.
    expect(field('y')).toBe('Y28.00 + j0.00 mS');
    expect(field('return-loss')).toBe(`RL${(20 * Math.log10(6)).toFixed(2)} dB`);
  });

  it('shows only Δf and ΔRL for a delta marker', () => {
    show({ markers: [marker('a', 1e9), marker('d', 2e9, { type: 'delta', refId: 'a' })], selectedMarkerId: 'd' });
    expect(field('marker')).toBe('DM2S11');
    expect(field('delta-f')).toBe('Δf1.0000 GHz');
    // RL 6.99 dB at 2 GHz minus 9.54 dB at 1 GHz.
    expect(field('delta-rl')).toBe(`ΔRL−${(20 * Math.log10(3) + 10 * Math.log10(0.2)).toFixed(2)} dB`);
    expect(field('z')).toBeUndefined();
  });

  it('steps through markers with the strip buttons and ignores markers of other panes', () => {
    const onSelectMarker = vi.fn();
    show({ markers: [marker('a', 1e9), marker('x', 1e9, { trace: 'elsewhere' }), marker('b', 2e9)], selectedMarkerId: 'b', onSelectMarker });
    expect(screen.queryByTestId('smith-marker-x')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next marker' }));
    expect(onSelectMarker).toHaveBeenLastCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: 'Previous marker' }));
    expect(onSelectMarker).toHaveBeenLastCalledWith('a');
  });

  it('hides the strip when no readout field is asked for, and says so when the pane is empty', () => {
    const { unmount } = show({ readout: [] });
    expect(screen.queryByTestId('smith-readout')).toBeNull();
    unmount();
    show({ traces: [] });
    expect(screen.getByText('No reflection traces in this pane.')).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Smith chart, empty');
  });

  it('tints the area outside the unit circle for an active port', () => {
    show({ traces: [{ ...s11, samples: [...s11.samples, { frequencyHz: 3e9, gamma: { re: 1.3, im: 0 } }] }], markers: [marker('a', 3e9)], selectedMarkerId: 'a' });
    expect(screen.getByTestId('smith-active-area')).toBeInTheDocument();
    // Γ = 1.3 is Z = 50 · 2.3 / (−0.3): a negative resistance, shown as it is.
    expect(field('z')).toBe('Z−383.3 + j0.00 Ω');
    expect(field('vswr')).toBe('VSWR—');
  });

  it('zooms with the wheel and fits again on double-click and on a fit request', () => {
    const { rerender } = show({ fitRequest: 0 });
    const plot = screen.getByTestId('smith-plot');
    const fitted = scaleOf();
    expect(fitted).toBeGreaterThan(100);
    fireEvent.wheel(plot, { deltaY: -100, clientX: 300, clientY: 200 });
    expect(scaleOf()).toBeGreaterThan(fitted);
    fireEvent.doubleClick(plot);
    expect(scaleOf()).toBeCloseTo(fitted, 9);
    fireEvent.wheel(plot, { deltaY: 100, clientX: 300, clientY: 200 });
    expect(scaleOf()).toBeLessThan(fitted);
    rerender(createElement(SmithPane, { traces: [s11, created], size, fitRequest: 1 }));
    expect(scaleOf()).toBeCloseTo(fitted, 9);
    fireEvent.keyDown(plot, { key: '+' });
    expect(scaleOf()).toBeGreaterThan(fitted);
    fireEvent.keyDown(plot, { key: ' ' });
    expect(scaleOf()).toBeCloseTo(fitted, 9);
  });

  it('draws a ghost ring at the linked cursor frequency', () => {
    show({ cursorFrequencyHz: 1.5e9 });
    expect(screen.getAllByTestId('smith-ghost')).toHaveLength(2);
  });

  it('reports the clicked distance to the nearest sample', () => {
    const onTraceClick = vi.fn();
    show({ traces: [s11], onTraceClick });
    const plot = screen.getByTestId('smith-plot');
    fireEvent(plot, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 200 }));
    fireEvent(plot, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 300, clientY: 200 }));
    expect(onTraceClick).toHaveBeenCalledWith(expect.objectContaining({ traceId: 's11', sampleFrequencyHz: 1.5e9, sampleDistancePx: 0 }));
  });

  it('does not draw a marker whose frequency lies across a gap', () => {
    const first = s11.samples[0], last = s11.samples[2];
    if (!first || !last) throw new Error('fixture');
    show({ traces: [{ ...s11, samples: [first, { frequencyHz: 1.5e9, gamma: { re: NaN, im: NaN } }, last] }], markers: [marker('gap', 1.5e9)], selectedMarkerId: 'gap' });
    expect(screen.queryByTestId('smith-marker-gap')).toBeNull();
  });
});
