import { describe, expect, it } from 'vitest';
import { LATEX_MAX_POINTS, axisPrefix, latexEscape, latexFigure, latexNumber, scaledAxisLabel } from '../../src/domain/export-latex';
import type { LatexFigureInput } from '../../src/domain/export-latex';

const ramp = (n: number, from = 0, to = 8.5e9) => Array.from({ length: n }, (_, i) => ({ freq: from + (to - from) * i / (n - 1), amp: Math.sin(i / 10) * 20 }));

const input = (patch: Partial<LatexFigureInput> = {}): LatexFigureInput => ({
  paneName: 'Pane 1',
  date: new Date(2026, 10, 13),
  x: { min: 0, max: 8.5e9, label: 'Frequency (Hz)', unit: 'Hz' },
  y: { min: -90, max: 90, label: 'Magnitude (dB)' },
  traces: [
    { name: 'chain.s2p S11 magnitude-db', color: { r: 80, g: 100, b: 200 }, symbol: 'circle', data: ramp(201) },
    { name: 'chain.s2p S21 magnitude-db', color: { r: 190, g: 60, b: 100 }, symbol: 'square', data: ramp(201) },
  ],
  markers: [{ label: 'M1 2.86 GHz', x: 2.86e9, y: -10.2, trace: 0 }],
  lines: [{ type: 'v', value: 4e9, label: 'V1' }, { type: 'h', value: -3, label: 'H1' }, { type: 'v', value: 9e9, label: 'V2' }],
  ...patch,
});

describe('LaTeX helpers', () => {
  it('picks an engineering prefix for the axis span', () => {
    expect(axisPrefix(8.5e9)).toEqual({ factor: 1e9, prefix: 'G' });
    expect(axisPrefix(250e3)).toEqual({ factor: 1e3, prefix: 'k' });
    expect(axisPrefix(0.004)).toEqual({ factor: 1e-3, prefix: 'm' });
    expect(axisPrefix(0)).toEqual({ factor: 1, prefix: '' });
  });
  it('escapes LaTeX specials in names from files', () => {
    expect(latexEscape('a_b 50% #1 & {x} $y ~z')).toBe(String.raw`a\_b 50\% \#1 \& \{x\} \$y \textasciitilde{}z`);
    expect(latexEscape('back\\slash ^')).toBe(String.raw`back\textbackslash{}slash \textasciicircum{}`);
  });
  it('writes numbers pgfplots reads', () => {
    expect(latexNumber(2.8600000001)).toBe('2.86');
    expect(latexNumber(-1.23456789e-7)).toBe('-1.23457e-7');
    expect(latexNumber(0)).toBe('0');
    expect(latexNumber(Number.NaN)).toBe('nan');
  });
  it('scales the unit inside the axis title', () => {
    expect(scaledAxisLabel('Frequency (Hz)', 'Hz', 'G')).toBe('Frequency (GHz)');
    expect(scaledAxisLabel('Time (s)', 's', String.raw`\textmu{}`)).toBe(String.raw`Time (\textmu{}s)`);
    expect(scaledAxisLabel('Frequency (Hz)', 'Hz', '')).toBe('Frequency (Hz)');
    expect(scaledAxisLabel('Amplitude', null, 'k')).toBe('Amplitude');
  });
});

describe('latexFigure', () => {
  const tex = latexFigure(input());
  it('is a complete figure environment with axes from the render', () => {
    expect(tex).toContain(String.raw`\begin{figure}[t]`);
    expect(tex).toContain(String.raw`\end{figure}`);
    expect(tex).toContain(String.raw`width=\columnwidth`);
    expect(tex).toContain('xmin=0, xmax=8.5, ymin=-90, ymax=90');
    expect(tex).toContain('xlabel={Frequency (GHz)}, ylabel={Magnitude (dB)}');
    expect(tex).toContain(String.raw`\caption{Pane 1.}`);
    expect(tex).toContain(String.raw`\label{fig:pane-1}`);
    expect((tex.match(/\\begin\{/g) ?? []).length).toBe((tex.match(/\\end\{/g) ?? []).length);
  });
  it('defines one named colour per trace and uses print-safe marks and dashes', () => {
    expect(tex).toContain(String.raw`\definecolor{msTraceA}{RGB}{80,100,200}`);
    expect(tex).toContain(String.raw`\definecolor{msTraceB}{RGB}{190,60,100}`);
    expect(tex).toMatch(/\\addplot\[color=msTraceA, solid, mark=o,/);
    expect(tex).toMatch(/\\addplot\[color=msTraceB, dashed, mark=square,/);
    expect(tex).toContain(String.raw`\addlegendentry{chain.s2p S11 magnitude-db}`);
  });
  it('limits points per trace and scales X', () => {
    const big = latexFigure(input({ traces: [{ name: 'big', color: { r: 0, g: 0, b: 0 }, symbol: null, data: ramp(20000) }] }));
    const coordinates = big.match(/\(([-\d.e]+),([-\d.e]+)\)/g) ?? [];
    expect(coordinates.length).toBeLessThanOrEqual(LATEX_MAX_POINTS + 4);
    expect(coordinates.length).toBeGreaterThan(100);
    expect(big).toContain('mark=none');
    expect(coordinates.every(text => Number(text.slice(1).split(',')[0]) <= 8.5 + 1e-9)).toBe(true);
  });
  it('pins markers and draws reference lines inside the range only', () => {
    expect(tex).toContain('at (axis cs:2.86,-10.2)');
    expect(tex).toContain('{M1 2.86 GHz}');
    expect(tex).toContain('(axis cs:4,-90) -- (axis cs:4,90)');
    expect(tex).toContain('(axis cs:0,-3) -- (axis cs:8.5,-3)');
    expect(tex).not.toContain('V2');
  });
});
