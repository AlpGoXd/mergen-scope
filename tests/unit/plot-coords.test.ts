import { describe, expect, it } from 'vitest';
import {
  axisValueToPixel,
  BOX_ZOOM_MIN_Y_PX,
  centerXDomain,
  zoomXByFactor,
  centerYDomain,
  dragZoomBox,
  dragZoomXDomain,
  dragZoomYDomain,
  isBoxZoomGesture,
  paddedYDomain,
  panXDomain,
  panYDomain,
  pixelToAxisValue,
  refLineYTolerance,
  zoomYDomain,
} from '../../src/domain/chart/plot-coords';

const plot = { left: 56, top: 10, width: 400, height: 200 };

describe('linear plot coordinates', () => {
  it('round-trips horizontal pixels', () => {
    const { left, width } = plot;
    for (const [pixel, frequency] of [[56, 100], [156, 150], [456, 300]] as const) {
      expect(pixelToAxisValue(pixel, left, width, 100, 300)).toBe(frequency);
      expect(axisValueToPixel(frequency, left, width, 100, 300)).toBe(pixel);
    }
  });

  it('round-trips vertical pixels with larger values at the top', () => {
    const { top, height } = plot;
    for (const [pixel, amplitude] of [[10, -20], [60, -40], [210, -100]] as const) {
      expect(pixelToAxisValue(pixel, top, height, -100, -20, true)).toBe(amplitude);
      expect(axisValueToPixel(amplitude, top, height, -100, -20, true)).toBe(pixel);
    }
  });

  it('rejects zero plot width, zero plot height, and collapsed domains', () => {
    expect(pixelToAxisValue(100, plot.left, 0, 100, 300)).toBeNull();
    expect(pixelToAxisValue(30, plot.top, 0, -100, -20, true)).toBeNull();
    expect(axisValueToPixel(200, plot.left, 0, 100, 300)).toBeNull();
    expect(axisValueToPixel(-40, plot.top, 0, -100, -20, true)).toBeNull();
    expect(pixelToAxisValue(100, plot.left, plot.width, 100, 100)).toBeNull();
    expect(axisValueToPixel(100, plot.left, plot.width, 100, 100)).toBeNull();
  });

  it('clamps outside pixels while projecting off-axis values past the plot', () => {
    expect(pixelToAxisValue(-100, plot.left, plot.width, 100, 300)).toBe(100);
    expect(pixelToAxisValue(600, plot.left, plot.width, 100, 300)).toBe(300);
    expect(pixelToAxisValue(-100, plot.top, plot.height, -100, -20, true)).toBe(-20);
    expect(pixelToAxisValue(600, plot.top, plot.height, -100, -20, true)).toBe(-100);
    expect(axisValueToPixel(50, plot.left, plot.width, 100, 300)).toBe(-44);
    expect(axisValueToPixel(-120, plot.top, plot.height, -100, -20, true)).toBe(260);
  });

  it('round-trips a pixel in a microhertz-scale window at 8 GHz', () => {
    const min = 8e9;
    const step = 2 ** -20; // One representable step at 8 GHz.
    const max = min + 16 * step;
    const pixel = plot.left + plot.width / 4;
    const frequency = min + 4 * step;
    expect(pixelToAxisValue(pixel, plot.left, plot.width, min, max)).toBe(frequency);
    expect(axisValueToPixel(frequency, plot.left, plot.width, min, max)).toBe(pixel);
  });
});

describe('X drag domains', () => {
  it('sorts reversed drags and ignores zero span', () => {
    expect(dragZoomXDomain(220, 140)).toEqual({ left: 140, right: 220 });
    expect(dragZoomXDomain(140, 220)).toEqual({ left: 140, right: 220 });
    expect(dragZoomXDomain(140, 140)).toBeNull();
  });

  it('clips a reversed drag that starts and ends outside the plot', () => {
    const start = pixelToAxisValue(600, plot.left, plot.width, 100, 300);
    const end = pixelToAxisValue(-100, plot.left, plot.width, 100, 300);
    if (start === null || end === null) throw new Error('Expected a visible plot');
    expect(dragZoomXDomain(start, end)).toEqual({ left: 100, right: 300 });
  });

  it('pans using values on the starting window and preserves the span at each data edge', () => {
    const start = { left: 120, right: 180 };
    const bounds = { min: 100, max: 220 };
    expect(panXDomain(start, 160, 140, bounds)).toEqual({ left: 140, right: 200 });
    expect(panXDomain(start, 120, 180, bounds)).toEqual({ left: 100, right: 160 });
    expect(panXDomain(start, 180, 120, bounds)).toEqual({ left: 160, right: 220 });
    expect(panXDomain(start, 180, 120, null)).toEqual({ left: 180, right: 240 });
  });

  it('uses the data range when the pan window is at least as wide', () => {
    expect(panXDomain({ left: 120, right: 240 }, 200, 180, { min: 120, max: 240 }))
      .toEqual({ left: 120, right: 240 });
  });

  it('keeps tiny drag and pan windows precise at 8 GHz', () => {
    const min = 8e9;
    const step = 2 ** -20;
    const left = min + 8 * step;
    const right = min + 12 * step;
    expect(dragZoomXDomain(right, left)).toEqual({ left, right });
    expect(panXDomain({ left, right }, left, right, { min, max: min + 16 * step }))
      .toEqual({ left: min + 4 * step, right: left });
  });

  it('resolves diagonal box zoom for X and Y, and falls back to X-only on flat horizontal drags', () => {
    expect(isBoxZoomGesture(100, 100 + BOX_ZOOM_MIN_Y_PX - 1)).toBe(false);
    expect(isBoxZoomGesture(100, 100 + BOX_ZOOM_MIN_Y_PX)).toBe(true);
    expect(dragZoomYDomain(-10, -40)).toEqual({ min: -40, max: -10 });
    expect(dragZoomYDomain(-10, 5, 'log')).toBeNull();
    expect(dragZoomYDomain(1, 10, 'log')).toEqual({ min: 1, max: 10 });

    // Flat horizontal drag: Y is null so caller fits Y.
    expect(dragZoomBox(100, 200, -10, -15, 100, 104)).toEqual({ x: { left: 100, right: 200 }, y: null });
    // Diagonal drag in any quadrant: returns sorted X and Y.
    expect(dragZoomBox(200, 100, -40, -10, 180, 120)).toEqual({
      x: { left: 100, right: 200 },
      y: { min: -40, max: -10 },
    });
    // Zero-width drag returns null.
    expect(dragZoomBox(100, 100, -40, -10, 180, 120)).toBeNull();
    // Log scale rejects non-positive bounds.
    expect(dragZoomBox(-10, 20, 1, 10, 180, 120, 'log', 'log')).toBeNull();
    expect(dragZoomBox(10, 100, 1, 10, 180, 120, 'log', 'log')).toEqual({
      x: { left: 10, right: 100 },
      y: { min: 1, max: 10 },
    });
  });
});

describe('Y domains', () => {
  it('pads drag-fit and autoscale extents and handles flat and empty sample ranges', () => {
    expect(paddedYDomain(-80, -30, 0.08)).toEqual({ min: -84, max: -26 });
    expect(paddedYDomain(-80, -30, 0.05)).toEqual({ min: -82.5, max: -27.5 });
    expect(paddedYDomain(-40, -40, 0.08)).toEqual({ min: -41, max: -39 });
    expect(paddedYDomain(Infinity, -Infinity, 0.08)).toBeNull();
  });

  it('pans Y by 15 percent of its span', () => {
    const domain = { min: -80, max: -40 };
    expect(panYDomain(domain, 1)).toEqual({ min: -74, max: -34 });
    expect(panYDomain(domain, -1)).toEqual({ min: -86, max: -46 });
    expect(panYDomain({ min: -40, max: -40 }, 1)).toBeNull();
  });

  it('zooms out around the cursor and reverses with a zoom in around the same anchor', () => {
    const zoomed = zoomYDomain({ min: -80, max: -30 }, 1, -70);
    if (!zoomed) throw new Error('Expected a zoomed domain');
    expect(zoomed.min).toBeCloseTo(-80.8);
    expect(zoomed.max).toBeCloseTo(-26.8);
    const restored = zoomYDomain(zoomed, -1, -70);
    expect(restored?.min).toBeCloseTo(-80);
    expect(restored?.max).toBeCloseTo(-30);
  });

  it('uses a clamped cursor or the midpoint and keeps the wheel zoom span limit', () => {
    const domain = { min: 0, max: 100 };
    expect(zoomYDomain(domain, 1, -10)).toEqual({ min: 0, max: 108 });
    expect(zoomYDomain(domain, 1, 110)).toEqual({ min: -8, max: 100 });
    expect(zoomYDomain(domain, 1, null)).toEqual({ min: -4, max: 104 });
    expect(zoomYDomain({ min: 0, max: 1e-10 }, -1, null)).toBeNull();
    expect(zoomYDomain({ min: 0, max: Infinity }, 1, null)).toBeNull();
  });
});

describe('horizontal reference line hit tolerance', () => {
  it('maps eight vertical pixels to the visible Y range', () => {
    expect(refLineYTolerance({ min: -80, max: 20 }, 200)).toBe(4);
  });

  it.each([0, -100, Infinity, NaN])('returns zero for plot height %s', (height) => {
    expect(refLineYTolerance({ min: -80, max: 20 }, height)).toBe(0);
  });

  it.each([
    { min: -Infinity, max: 20 },
    { min: -80, max: NaN },
    { min: -Number.MAX_VALUE, max: Number.MAX_VALUE },
    { min: 20, max: 20 },
    { min: 20, max: -80 },
  ])('returns zero for an invalid Y range %o', (domain) => {
    expect(refLineYTolerance(domain, 200)).toBe(0);
  });
});

describe('reference line reveal domains', () => {
  it('centers X within the data bounds using the visible span', () => {
    const bounds = { min: 100, max: 300 };
    expect(centerXDomain(200, 40, bounds)).toEqual({ left: 180, right: 220 });
    expect(centerXDomain(105, 40, bounds)).toEqual({ left: 100, right: 140 });
    expect(centerXDomain(295, 40, bounds)).toEqual({ left: 260, right: 300 });
  });

  it('centers Y with the original span or the minimum span for a flat range', () => {
    expect(centerYDomain(20, -80, -40)).toEqual({ min: 0, max: 40 });
    expect(centerYDomain(0, 10, 10)).toEqual({ min: -5e-13, max: 5e-13 });
  });
});

describe('zoomXByFactor', () => {
  it('zooms a linear window in around its centre', () => {
    expect(zoomXByFactor({ left: 0, right: 100 }, 4)).toEqual({ left: 37.5, right: 62.5 });
  });
  it('zooms a log window in around its geometric centre', () => {
    const zoom = zoomXByFactor({ left: 1, right: 10_000 }, 2, 'log');
    expect(zoom?.left).toBeCloseTo(10);
    expect(zoom?.right).toBeCloseTo(1000);
  });
  it('refuses factors that would not zoom in and unusable windows', () => {
    expect(zoomXByFactor({ left: 0, right: 100 }, 1)).toBeNull();
    expect(zoomXByFactor({ left: 0, right: 100 }, Infinity)).toBeNull();
    expect(zoomXByFactor({ left: 5, right: 5 }, 2)).toBeNull();
    expect(zoomXByFactor({ left: 0, right: 100 }, 2, 'log')).toBeNull();
  });
});
