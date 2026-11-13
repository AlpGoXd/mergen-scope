import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectDelimiter, detectSkipRows, detectTabular, contentLines } from '../../src/domain/parsers/tabular-detect';
import { detectFileSignature, parseForImport } from '../../src/domain/parsers/parse-file';
import { parseTabularFile } from '../../src/domain/parsers/tabular';
import { resetParserFileCounter } from '../../src/domain/parsers/rs-dat';
import { overviewPlot, plotCaption, previewCaption, readNumericTable, setColumnRole, wizardBlocker, wizardLayout } from '../../src/domain/import-wizard';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';
import { initialWorkspaceEngine, workspaceEngineReducer, snapshotFromWorkspace } from '../../src/stores/aggregate-workspace-store';
import type { WizardConfig } from '../../src/types/file';

const fixture = (name: string) => readFileSync(`test files/${name}`, 'utf8');

// Oscilloscope export: a few metadata rows, then named columns with units.
const SCOPE = [
  'Model,DSOX1204G',
  'Serial,MY00000000',
  'Time (s),CH1 (V),CH2 (V)',
  '-1.000E-03,0.012,-0.004',
  '-0.999E-03,0.015,-0.006',
  '-0.998E-03,0.019,-0.007',
  '-0.997E-03,0.022,-0.009',
].join('\n');

// European spectrum analyser export: semicolons, a title block, MHz and dBm.
const SPECTRUM = [
  'Title;Band scan',
  'Date;12.11.2026',
  'Detector;Peak',
  'Frequency [MHz];Level [dBm]',
  '100.000;-62.1',
  '100.025;-61.8',
  '100.050;-60.4',
].join('\n');

// Data logger: tab separated, an index column first, time in ms, voltage in mV.
const LOGGER = 'Index\tTime(ms)\tVoltage(mV)\n1\t0\t12.5\n2\t10\t13.1\n3\t20\t12.9\n';

describe('import auto-detect', () => {
  it('reads an oscilloscope CSV with metadata rows', () => {
    const { config, domainConfidence } = detectTabular(SCOPE);
    expect(config).toMatchObject({ delimiter: ',', skipRows: 3, xCol: 0, yCols: [1, 2], domain: 'time', xUnit: 's', xMult: 1, yUnit: 'V' });
    expect(config.headers).toEqual(['Time (s)', 'CH1 (V)', 'CH2 (V)']);
    expect(domainConfidence).toBe('high');
  });

  it('reads a semicolon spectrum export and converts MHz', () => {
    const lines = contentLines(SPECTRUM);
    expect(detectDelimiter(lines)).toBe(';');
    expect(detectSkipRows(lines, ';')).toBe(4);
    const { config, domainConfidence } = detectTabular(SPECTRUM);
    expect(config).toMatchObject({ xCol: 0, yCols: [1], domain: 'frequency', xUnit: 'MHz', xMult: 1e6, yUnit: 'dBm', yMult: 1 });
    expect(domainConfidence).toBe('high');
  });

  it('skips an index column and picks the named time column as X', () => {
    const { config } = detectTabular(LOGGER);
    expect(config).toMatchObject({ delimiter: '\t', skipRows: 1, xCol: 1, yCols: [2], domain: 'time', xUnit: 'ms', xMult: 1e-3, yUnit: 'mV', yMult: 1e-3 });
  });

  it('guesses the domain from the numbers when nothing is named, with low confidence', () => {
    const time = detectTabular('0.000,1.2\n0.001,2.5\n0.002,3.1\n');
    expect(time.config).toMatchObject({ delimiter: ',', skipRows: 0, xCol: 0, yCols: [1], domain: 'time', xUnit: 's' });
    expect(time.domainConfidence).toBe('low');
    const frequency = detectTabular('1000000;-30\n2000000;-31\n3000000;-29\n');
    expect(frequency.config).toMatchObject({ delimiter: ';', domain: 'frequency', xUnit: 'Hz' });
    expect(frequency.domainConfidence).toBe('low');
  });

  it('reads the shipped waveform fixtures', () => {
    expect(detectTabular(fixture('test_osc_waveform.csv')).config).toMatchObject({ delimiter: ',', skipRows: 1, xCol: 0, yCols: [1, 2], domain: 'time' });
    expect(detectTabular(fixture('waveform_sinc_test.csv')).config).toMatchObject({ skipRows: 1, xCol: 0, yCols: [1, 2], domain: 'time' });
  });
});

describe('opening decides by content', () => {
  it('imports recognised signatures directly, whatever the extension', () => {
    expect(detectFileSignature(fixture('cascade_ip3_-12dBm.DAT'))).toBe('rs-dat');
    expect(detectFileSignature(fixture('cascaded chain.s2p'))).toBe('touchstone');
    resetParserFileCounter();
    expect(parseForImport(fixture('cascade_ip3_-12dBm.DAT'), 'renamed.csv').format).not.toBe('needs-import-wizard');
    expect(parseForImport(fixture('cascaded chain.s2p'), 'network.txt').touchstoneNetwork).toBeDefined();
  });

  it('sends everything else to the wizard, even confident CSVs and .dat names', () => {
    expect(detectFileSignature(SCOPE)).toBeNull();
    expect(detectFileSignature('# exported by scope\nTime,CH1\n0,1\n')).toBeNull();
    const parsed = parseForImport(SCOPE, 'capture.dat');
    expect(parsed.format).toBe('needs-import-wizard');
    expect(parsed.suggestedConfig?.skipRows).toBe(3);
  });
});

describe('wizard rules', () => {
  const config = detectTabular(SCOPE).config;
  const layout = wizardLayout(SCOPE, config);

  it('has one X: choosing a new X demotes the old one to skip', () => {
    const next = setColumnRole(config, 1, 'x');
    expect(next.xCol).toBe(1);
    expect(next.yCols).toEqual([2]);
    expect(setColumnRole(next, 1, 'y')).toMatchObject({ xCol: -1, yCols: [1, 2] });
  });

  it('explains why Add is unavailable', () => {
    expect(wizardBlocker(config, layout)).toBeNull();
    expect(wizardBlocker(setColumnRole(config, 0, 'skip'), layout)).toMatch(/No X column/);
    const tab = { ...config, delimiter: '\t' };
    expect(wizardBlocker(tab, wizardLayout(SCOPE, tab))).toMatch(/No numeric columns/);
  });

  it('captions the preview', () => {
    expect(previewCaption(8, 10000, 2)).toBe('first 8 of 10 000 rows · rows 1–2 skipped');
    expect(previewCaption(3, 3, 0)).toBe('first 3 of 3 rows');
  });

  it('converts a picked unit to the base unit', () => {
    resetParserFileCounter();
    const parsed = parseTabularFile(LOGGER, 'log.tsv', detectTabular(LOGGER).config);
    expect(parsed.traces[0]?.units).toEqual({ x: 's', y: 'V' });
    expect(parsed.traces[0]?.data[1]?.freq).toBeCloseTo(0.01);
    expect(parsed.traces[0]?.data[0]?.amp).toBeCloseTo(0.0125);
  });
});

describe('Edit columns', () => {
  const text = 'Time (s),CH1 (V),CH2 (V)\n0,1,2\n1,3,4\n2,5,6\n';
  const open = () => {
    const parsed = parseForImport(text, 'scope.csv');
    let engine = workspaceEngineReducer(initialWorkspaceEngine(), { type: 'change', command: { slice: 'open-data', inputs: [{ id: 'f', name: 'scope.csv', text, parsed }], limit: 4 } });
    const queued = engine.present.files.wizardQueue[0];
    if (!queued?.suggestedConfig) throw Error('wizard entry');
    const picked: WizardConfig = { ...queued.suggestedConfig, yCols: [2], yUnit: 'mV', yMult: 1e-3 };
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', limit: 4, action: { type: 'RESOLVE_WIZARD', payload: { id: 'f', config: picked } } } });
    return { engine, picked };
  };

  it('opens pre-filled with the last settings and adds no undo step until Apply', () => {
    const { engine: imported, picked } = open();
    expect(imported.present.files.files).toHaveLength(1);
    const pastBefore = imported.history.past.length;
    let engine = workspaceEngineReducer(imported, { type: 'change', command: { slice: 'files', action: { type: 'RERUN_WIZARD', payload: { fileId: 'f', fileName: 'scope.csv' } } } });
    const entry = engine.present.files.wizardQueue[0];
    expect(entry?.mode).toBe('edit');
    expect(entry?.suggestedConfig).toEqual(picked);
    expect(engine.history.past).toHaveLength(pastBefore);

    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', limit: 4, action: { type: 'RESOLVE_WIZARD', payload: { id: 'f', config: { ...picked, yCols: [1, 2] } } } } });
    expect(engine.present.files.wizardQueue).toHaveLength(0);
    expect(engine.present.files.files[0]?.columnIdentities?.map(column => column.header)).toEqual(['CH1 (V)', 'CH2 (V)']);
    expect(engine.history.past).toHaveLength(pastBefore + 1);

    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.files.files[0]?.columnIdentities?.map(column => column.header)).toEqual(['CH2 (V)']);
    expect(engine.present.files.wizardQueue).toHaveLength(0);
  });

  it('cancelling Edit columns leaves history alone', () => {
    const { engine: imported } = open();
    const pastBefore = imported.history.past.length;
    let engine = workspaceEngineReducer(imported, { type: 'change', command: { slice: 'files', action: { type: 'RERUN_WIZARD', payload: { fileId: 'f', fileName: 'scope.csv' } } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', action: { type: 'SKIP_WIZARD', payload: { id: 'f' } } } });
    expect(engine.present.files.wizardQueue).toHaveLength(0);
    expect(engine.history.past).toHaveLength(pastBefore);
  });

  it('saves and restores the picked units in a workspace', () => {
    const { engine } = open();
    const snapshot = snapshotFromWorkspace(engine.present);
    const restored = migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)));
    expect(restored?.files[0]?.wizardConfig).toMatchObject({ xUnit: 's', yUnit: 'mV', yMult: 1e-3 });
    const broken = JSON.parse(JSON.stringify(snapshot));
    broken.files[0].wizardConfig.yUnit = 5;
    expect(migrateWorkspaceV5(broken)).toBeNull();
  });
});

describe('whole-file preview plot', () => {
  const csv = (rows: number, value: (i: number) => number) => ['t,a', ...Array.from({ length: rows }, (_, i) => `${i},${value(i)}`)].join('\n');
  const plotOf = (text: string, maxRows?: number) => {
    const config = detectTabular(text).config;
    const layout = wizardLayout(text, config);
    const table = readNumericTable(layout.lines, config.delimiter, config.skipRows, layout.headers.length, maxRows);
    return { table, plot: overviewPlot(table, config.xCol, config.yCols, 8) };
  };

  it('uses every row, but stays within about two points per bucket', () => {
    const { table, plot } = plotOf(csv(20000, (i) => Math.sin(i / 50)));
    expect(table.total).toBe(20000);
    expect(table.stride).toBe(1);
    expect(plotCaption(table)).toBe('Plot: all 20 000 rows');
    expect(plot.series[0]!.length).toBeLessThanOrEqual(2 * 600 + 4);
    expect(plot.series[0]!.length).toBeGreaterThan(600);
  });

  it('keeps a single-sample spike far beyond the first rows', () => {
    const { plot } = plotOf(csv(20000, (i) => (i === 15321 ? 50 : 0)));
    const line = plot.series[0]!;
    // The spike sets the top of the shared scale (y = 0) and sits about 77 % along X.
    const top = line.find((point) => point.y === 0);
    expect(top?.x).toBeCloseTo(15321 / 19999, 3);
  });

  it('marks where the table rows sit', () => {
    const { plot } = plotOf(csv(1000, (i) => i));
    expect(plot.band?.from).toBe(0);
    expect(plot.band?.to).toBeCloseTo(7 / 999, 5);
  });

  it('reads every k-th row of very long files and says so', () => {
    const { table, plot } = plotOf(csv(2000, (i) => i), 500);
    expect(table.stride).toBe(4);
    expect(plotCaption(table)).toBe('Plot: every 4th of 2 000 rows');
    expect(plot.series[0]!.at(-1)?.x).toBe(1);
  });

  it('plots unsorted X the way the importer will read it', () => {
    const { plot } = plotOf('x,y\n3,30\n1,10\n2,20\n');
    expect(plot.series[0]).toEqual([{ x: 0, y: 1 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0 }]);
  });
});
