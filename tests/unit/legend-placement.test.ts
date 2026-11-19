import { describe, expect, it } from 'vitest';
import {
  DODGE_DISTANCE_PX,
  RETURN_DELAY_MS,
  RETURN_DISTANCE_PX,
  chooseHomeCorner,
  distanceToRect,
  initialDodgeState,
  legendBox,
  returnDelay,
  stepDodge,
} from '../../src/domain/chart/legend-placement';
import type { DodgeInput, HomeCornerInput } from '../../src/domain/chart/legend-placement';

const pane = { width: 600, height: 300 };
const legend = { width: 200, height: 80 };
const plot = { left: 50, top: 10, width: 520, height: 250 };

// X 0..100 and Y 0..10 map onto the plot rectangle; the legend boxes sit at x 388..588 (right) and 12..212 (left), y 12..92.
function home(rows: Array<Record<string, number>>): ReturnType<typeof chooseHomeCorner> {
  const input: HomeCornerInput = { rows, xKey: 'fs', yKeys: ['a'], xDomain: [0, 100], yDomain: [0, 10], plot, pane, legend };
  return chooseHomeCorner(input);
}

describe('chooseHomeCorner', () => {
  it('prefers top-right when nothing is plotted or the geometry is unknown', () => {
    expect(home([])).toBe('top-right');
    expect(chooseHomeCorner({ rows: [{ fs: 5, a: 9.5 }], xKey: 'fs', yKeys: ['a'], xDomain: null, yDomain: [0, 10], plot, pane, legend })).toBe('top-right');
    expect(chooseHomeCorner({ rows: [{ fs: 5, a: 9.5 }], xKey: 'fs', yKeys: ['a'], xDomain: [0, 100], yDomain: [0, 10], plot: { ...plot, width: 0 }, pane, legend })).toBe('top-right');
  });

  it('breaks a tie toward top-right', () => {
    expect(home([{ fs: 5, a: 9.5 }, { fs: 95, a: 9.5 }])).toBe('top-right');
  });

  it('moves to top-left when the trace runs under the top-right box', () => {
    expect(home([{ fs: 90, a: 9.5 }, { fs: 95, a: 9.8 }])).toBe('top-left');
  });

  it('stays top-right when the trace runs under the top-left box', () => {
    expect(home([{ fs: 5, a: 9.5 }, { fs: 10, a: 9.8 }])).toBe('top-right');
  });

  it('ignores points that are low in the plot, outside the domain or not finite', () => {
    // Only the point at fs 5 counts (top-left box), so the legend stays top-right.
    expect(home([{ fs: 90, a: 1 }, { fs: 150, a: 9.5 }, { fs: 90, a: Number.NaN }, { fs: 5, a: 9.5 }])).toBe('top-right');
    // Only the point at fs 90 counts (top-right box), so the legend moves left.
    expect(home([{ fs: 90, a: 9.5 }, { fs: -50, a: 9.5 }, { fs: 5, a: Number.NaN }])).toBe('top-left');
  });

  it('counts every trace at a row', () => {
    const rows = [{ fs: 90, a: 9.5, b: 9.5 }, { fs: 5, a: 9.5, b: 1 }];
    const corner = chooseHomeCorner({ rows, xKey: 'fs', yKeys: ['a', 'b'], xDomain: [0, 100], yDomain: [0, 10], plot, pane, legend });
    expect(corner).toBe('top-left');
  });
});

describe('geometry', () => {
  it('places the legend 12 px from the top and the chosen side', () => {
    expect(legendBox('top-right', pane, legend)).toEqual({ left: 388, top: 12, width: 200, height: 80 });
    expect(legendBox('top-left', pane, legend)).toEqual({ left: 12, top: 12, width: 200, height: 80 });
  });

  it('measures the distance to a box', () => {
    const box = legendBox('top-right', pane, legend);
    expect(distanceToRect({ x: 400, y: 50 }, box)).toBe(0);
    expect(distanceToRect({ x: 376, y: 50 }, box)).toBe(12);
    expect(distanceToRect({ x: 388 - 3, y: 92 + 4 }, box)).toBe(5);
  });
});

describe('stepDodge', () => {
  const base = { pane, legend, dots: [] } as const;
  const at = (x: number, y: number, now: number, extra: Partial<DodgeInput> = {}): DodgeInput =>
    ({ ...base, home: 'top-right', cursor: { x, y }, now, ...extra });

  it('stays home while the cursor is more than 12 px from the box', () => {
    const state = initialDodgeState('top-right');
    expect(stepDodge(state, at(388 - DODGE_DISTANCE_PX - 1, 50, 0))).toBe(state);
  });

  it('dodges to the other corner at 12 px', () => {
    const next = stepDodge(initialDodgeState('top-right'), at(388 - DODGE_DISTANCE_PX, 50, 0));
    expect(next).toEqual({ corner: 'top-left', clearSince: null });
  });

  it('dodges for a hover dot even when the cursor is far away', () => {
    const next = stepDodge(initialDodgeState('top-right'), at(100, 250, 0, { dots: [{ x: 450, y: 60 }] }));
    expect(next.corner).toBe('top-left');
  });

  it('does not return while the cursor stays within 24 px of the home box', () => {
    let state = { corner: 'top-left', clearSince: null } as const;
    const near = stepDodge(state, at(388 - RETURN_DISTANCE_PX, 50, 0));
    expect(near).toEqual({ corner: 'top-left', clearSince: null });
    state = near;
    expect(stepDodge(state, at(388 - RETURN_DISTANCE_PX, 50, 5000)).corner).toBe('top-left');
  });

  it('returns only after 300 ms beyond 24 px', () => {
    const away = at(388 - RETURN_DISTANCE_PX - 1, 50, 1000);
    const started = stepDodge({ corner: 'top-left', clearSince: null }, away);
    expect(started).toEqual({ corner: 'top-left', clearSince: 1000 });
    expect(returnDelay(started, 1100)).toBe(RETURN_DELAY_MS - 100);
    const early = stepDodge(started, { ...away, now: 1000 + RETURN_DELAY_MS - 1 });
    expect(early.corner).toBe('top-left');
    expect(stepDodge(early, { ...away, now: 1000 + RETURN_DELAY_MS })).toEqual(initialDodgeState('top-right'));
  });

  it('restarts the 300 ms when the cursor comes back inside 24 px', () => {
    const far = at(100, 250, 0);
    const started = stepDodge({ corner: 'top-left', clearSince: null }, far);
    expect(started.clearSince).toBe(0);
    const bounced = stepDodge(started, at(388 - 10, 50, 200));
    expect(bounced).toEqual({ corner: 'top-left', clearSince: null });
    const again = stepDodge(bounced, at(100, 250, 250));
    expect(again.clearSince).toBe(250);
    expect(stepDodge(again, at(100, 250, 250 + RETURN_DELAY_MS - 1)).corner).toBe('top-left');
    expect(stepDodge(again, at(100, 250, 250 + RETURN_DELAY_MS)).corner).toBe('top-right');
  });

  it('does not flicker: between 12 and 24 px the legend neither dodges nor returns', () => {
    const dodged = { corner: 'top-left', clearSince: null } as const;
    expect(stepDodge(dodged, at(388 - 18, 50, 0))).toBe(dodged);
    const atHome = initialDodgeState('top-right');
    expect(stepDodge(atHome, at(388 - 18, 50, 0))).toBe(atHome);
  });

  it('resets to home when the cursor leaves the pane', () => {
    expect(stepDodge({ corner: 'top-left', clearSince: 40 }, { ...base, home: 'top-right', cursor: null, now: 50 })).toEqual(initialDodgeState('top-right'));
  });

  it('works the same with a top-left home', () => {
    const dodged = stepDodge(initialDodgeState('top-left'), { ...base, home: 'top-left', cursor: { x: 100, y: 50 }, now: 0 });
    expect(dodged.corner).toBe('top-right');
  });

  it('has no pending return unless the clock is running', () => {
    expect(returnDelay(initialDodgeState('top-right'), 10)).toBeNull();
  });
});
