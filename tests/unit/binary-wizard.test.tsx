// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { ImportWizardModal } from '../../src/components/wizard/ImportWizardModal';
import { useFileDispatch, useFileState } from '../../src/stores/file-store';
import { useAggregateWorkspace } from '../../src/stores/aggregate-workspace-store';
import { defaultBinaryConfig } from '../../src/domain/parsers/raw-binary';
import type { BinaryImportConfig } from '../../src/domain/parsers/raw-binary';

function makeWavebinBuffer(channels: readonly { label: string; sampleCount: number }[], xUnits = 2): ArrayBuffer {
  const fileHeaderBytes = 12;
  const dhSize = 12;
  const wfmHeaderSize = 140;
  let total = fileHeaderBytes;
  for (const ch of channels) total += wfmHeaderSize + dhSize + ch.sampleCount * 4;

  const buf = new ArrayBuffer(total);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };

  writeAscii(0, 'AG10');
  view.setUint32(4, total, true);
  view.setUint32(8, channels.length, true);

  let cursor = fileHeaderBytes;
  for (const ch of channels) {
    view.setInt32(cursor, wfmHeaderSize, true);
    view.setInt32(cursor + 4, 1, true);
    view.setInt32(cursor + 8, 1, true);
    view.setInt32(cursor + 12, ch.sampleCount, true);
    view.setInt32(cursor + 16, 1, true);
    view.setFloat32(cursor + 20, ch.sampleCount * 1e-6, true);
    view.setFloat64(cursor + 24, 0, true);
    view.setFloat64(cursor + 32, 1e-6, true);
    view.setFloat64(cursor + 40, 0, true);
    view.setInt32(cursor + 48, xUnits, true); // 2 = s, 6 = Hz
    view.setInt32(cursor + 52, 1, true); // V
    writeAscii(cursor + 88, 'DSO-X 1102G:MY1234');
    writeAscii(cursor + 112, ch.label);
    cursor += wfmHeaderSize;

    const payloadBytes = ch.sampleCount * 4;
    view.setInt32(cursor, dhSize, true);
    view.setInt16(cursor + 4, 1, true);
    view.setInt16(cursor + 6, 4, true);
    view.setUint32(cursor + 8, payloadBytes, true);
    cursor += dhSize;

    for (let i = 0; i < ch.sampleCount; i++) {
      view.setFloat32(cursor + i * 4, (i % 16) * 0.1, true);
    }
    cursor += payloadBytes;
  }
  return buf;
}

function makeRawUint8Buffer(sampleCount: number): ArrayBuffer {
  const buf = new ArrayBuffer(sampleCount);
  const bytes = new Uint8Array(buf);
  bytes[0] = 0;
  bytes[1] = 128;
  bytes[Math.max(0, sampleCount - 1)] = 255;
  return buf;
}

interface WizardHarnessProps {
  initialEntry?: {
    id: string;
    fileName: string;
    buffer: ArrayBuffer;
    binaryConfig?: BinaryImportConfig;
    binaryWarning?: string;
  };
  onState?: (snap: {
    files: ReturnType<typeof useFileState>;
    dispatch: ReturnType<typeof useFileDispatch>;
    workspace: ReturnType<typeof useAggregateWorkspace>;
  }) => void;
}

function WizardHarness({ initialEntry, onState }: WizardHarnessProps) {
  const files = useFileState();
  const dispatch = useFileDispatch();
  const workspace = useAggregateWorkspace();
  onState?.({ files, dispatch, workspace });

  React.useEffect(() => {
    if (!initialEntry) return;
    workspace.historyDispatch({
      type: 'change',
      command: {
        slice: 'open-data',
        limit: 4,
        inputs: [
          {
            id: initialEntry.id,
            name: initialEntry.fileName,
            text: '',
            parsed: {
              format: 'needs-binary-wizard',
              fileName: initialEntry.fileName,
              meta: {},
              traces: [],
            },
            rawBinary: initialEntry.buffer,
            binaryConfig: initialEntry.binaryConfig,
            ...(initialEntry.binaryWarning ? { binaryWarning: initialEntry.binaryWarning } : {}),
          },
        ],
      },
    });
  }, []);

  return <ImportWizardModal />;
}

function renderBinaryWizard(props: WizardHarnessProps) {
  let latest: {
    files: ReturnType<typeof useFileState>;
    dispatch: ReturnType<typeof useFileDispatch>;
    workspace: ReturnType<typeof useAggregateWorkspace>;
  } | null = null;
  const result = render(
    <StoreRoot>
      <WizardHarness
        {...props}
        onState={snap => {
          latest = snap;
        }}
      />
    </StoreRoot>,
  );
  return {
    ...result,
    getLatest: () => latest,
  };
}

function mockDeviceMemory(value: number | undefined) {
  Object.defineProperty(window.navigator, 'deviceMemory', {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  mockDeviceMemory(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window.navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;
});

describe('BinaryWizardDialog R1 confidence & R5 point-budget UI', () => {
  it('displays R1 confidence indicator for high (Wavebin), medium (override & .cf32), and low (generic raw / warning)', () => {
    const wavebinBuf = makeWavebinBuffer([{ label: 'CH1', sampleCount: 64 }]);
    const { unmount } = renderBinaryWizard({
      initialEntry: {
        id: 'wb-1',
        fileName: 'keysight.bin',
        buffer: wavebinBuf,
        binaryConfig: defaultBinaryConfig('keysight.bin', wavebinBuf.byteLength, 'wavebin'),
      },
    });

    expect(screen.getByTestId('binary-wizard-detected')).toHaveTextContent('Detected: Keysight / Rigol (.bin)');
    const conf = screen.getByTestId('binary-wizard-confidence');
    expect(conf).toHaveAttribute('data-confidence-level', 'high');
    expect(conf).toHaveTextContent('High confidence · 100%');
    expect(conf).toHaveTextContent('Keysight / Rigol (.bin)');
    expect(screen.queryByTestId('binary-wizard-reasons')).toBeNull();

    // Force parser override -> Medium confidence · 68% + reasons list.
    fireEvent.click(screen.getByRole('button', { name: 'Choose parser format' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'LeCroy (.trc)' }));
    expect(conf).toHaveAttribute('data-confidence-level', 'medium');
    expect(conf).toHaveTextContent('Medium confidence · 68%');
    expect(screen.getByTestId('binary-wizard-reasons')).toHaveTextContent('Selected parser overrides detected header signature');
    unmount();

    // Strict raw SDR extension (.cf32) -> Medium confidence · 65% + reasons list.
    const cf32Buf = new ArrayBuffer(64);
    const cf32View = new DataView(cf32Buf);
    for (let i = 0; i < 16; i++) cf32View.setFloat32(i * 4, Math.sin(i), true);
    const cf32Render = renderBinaryWizard({
      initialEntry: {
        id: 'cf32-1',
        fileName: 'capture.cf32',
        buffer: cf32Buf,
        binaryConfig: defaultBinaryConfig('capture.cf32', cf32Buf.byteLength, null),
      },
    });
    const cf32Conf = screen.getByTestId('binary-wizard-confidence');
    expect(cf32Conf).toHaveAttribute('data-confidence-level', 'medium');
    expect(cf32Conf).toHaveTextContent('Medium confidence · 65%');
    expect(screen.getByTestId('binary-wizard-reasons')).toHaveTextContent('Sample type and channel layout inferred from file extension');
    cf32Render.unmount();

    // Generic headerless raw (.bin) with warning -> Low confidence · 30% + warning MessageBar.
    const rawBuf = makeRawUint8Buffer(64);
    const warnRender = renderBinaryWizard({
      initialEntry: {
        id: 'raw-warn',
        fileName: 'unknown.bin',
        buffer: rawBuf,
        binaryConfig: defaultBinaryConfig('unknown.bin', rawBuf.byteLength, null),
        binaryWarning: 'Header checksum mismatch',
      },
    });
    const warnConf = screen.getByTestId('binary-wizard-confidence');
    expect(warnConf).toHaveAttribute('data-confidence-level', 'low');
    expect(warnConf).toHaveTextContent('Low confidence · 30%');
    const warnReasons = screen.getByTestId('binary-wizard-reasons');
    expect(within(warnReasons).getByRole('status')).toHaveTextContent('Header checksum mismatch');
    warnRender.unmount();

    // Generic raw without warning -> Low confidence · 25% + warning MessageBar.
    renderBinaryWizard({
      initialEntry: {
        id: 'raw-low',
        fileName: 'mystery.bin',
        buffer: rawBuf,
        binaryConfig: defaultBinaryConfig('mystery.bin', rawBuf.byteLength, null),
      },
    });
    const lowConf = screen.getByTestId('binary-wizard-confidence');
    expect(lowConf).toHaveAttribute('data-confidence-level', 'low');
    expect(lowConf).toHaveTextContent('Low confidence · 25%');
    expect(within(screen.getByTestId('binary-wizard-reasons')).getByRole('status')).toHaveTextContent('Headerless raw binary');
  });

  it('stays quiet at <= SOFT_POINT_LIMIT (2M) and shows live large notice reacting to Samples and Layout edits', () => {
    const okBuf = makeRawUint8Buffer(2_000_000);
    const okRender = renderBinaryWizard({
      initialEntry: {
        id: 'u8-ok',
        fileName: 'ok.u8',
        buffer: okBuf,
        binaryConfig: defaultBinaryConfig('ok.u8', okBuf.byteLength, null),
      },
    });
    expect(screen.queryByTestId('binary-wizard-budget')).toBeNull();
    okRender.unmount();

    const largeBuf = makeRawUint8Buffer(3_000_000);
    renderBinaryWizard({
      initialEntry: {
        id: 'u8-large',
        fileName: 'large.u8',
        buffer: largeBuf,
        binaryConfig: defaultBinaryConfig('large.u8', largeBuf.byteLength, null),
      },
    });

    const budget = screen.getByTestId('binary-wizard-budget');
    expect(budget).toHaveAttribute('data-budget-level', 'large');
    expect(screen.getByTestId('binary-wizard-budget-summary')).toHaveTextContent(
      '1 channel × 3 M = 3 M points. Keep all needs about 206 MB of memory.',
    );

    const keepAll = within(budget).getByRole('radio', { name: /Keep all samples/i });
    const decimate = within(budget).getByRole('radio', { name: /Decimate by/i });
    const envelope = within(budget).getByRole('radio', { name: /Display envelope/i });
    expect(keepAll).toBeEnabled();
    expect(decimate).toBeEnabled();
    expect(envelope).toBeEnabled();
    expect(keepAll).toBeChecked();
    expect(screen.getByTestId('binary-wizard-keep-all-note')).toHaveTextContent('The app may be slower to zoom and analyse.');
    expect(screen.getByTestId('binary-wizard-decimate-factor')).toHaveValue(2);
    expect(screen.getByTestId('binary-wizard-budget-hint')).toHaveTextContent(/Start \/ Samples/i);

    // Narrow Samples to 1_000_000 -> drops to ok -> notice hides.
    const samplesInput = screen.getByLabelText('Samples');
    fireEvent.change(samplesInput, { target: { value: '1000000' } });
    expect(screen.queryByTestId('binary-wizard-budget')).toBeNull();

    // Restore Samples to 0 -> notice reappears.
    fireEvent.change(samplesInput, { target: { value: '0' } });
    expect(screen.getByTestId('binary-wizard-budget')).toHaveAttribute('data-budget-level', 'large');

    // Switch Layout to IQ -> 2 channels × 1.5 M = 3 M total -> summary & factor update live.
    const layoutGroup = screen.getByRole('radiogroup', { name: 'Channel layout' });
    fireEvent.click(within(layoutGroup).getByRole('radio', { name: /Complex IQ/i }));
    expect(screen.getByTestId('binary-wizard-budget-summary')).toHaveTextContent(
      '2 channels × 1.5 M = 3 M points. Keep all needs about 206 MB of memory.',
    );
  });

  it('reacts live to auto-scope channel checkbox toggles across the SOFT_POINT_LIMIT boundary', () => {
    const wbBuf = makeWavebinBuffer([
      { label: 'CH1', sampleCount: 1_500_000 },
      { label: 'CH2', sampleCount: 1_500_000 },
    ]);
    renderBinaryWizard({
      initialEntry: {
        id: 'wb-2ch',
        fileName: 'two_ch.bin',
        buffer: wbBuf,
        binaryConfig: defaultBinaryConfig('two_ch.bin', wbBuf.byteLength, 'wavebin'),
      },
    });

    expect(screen.getByTestId('binary-wizard-budget')).toHaveAttribute('data-budget-level', 'large');
    expect(screen.getByTestId('binary-wizard-budget-summary')).toHaveTextContent('2 channels × 1.5 M = 3 M points.');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable CH2' }));
    expect(screen.queryByTestId('binary-wizard-budget')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable CH2' }));
    expect(screen.getByTestId('binary-wizard-budget')).toHaveAttribute('data-budget-level', 'large');
  });

  it('handles very-large (11M) defaults, deviceMemory present vs undefined, Decimate edits, null sampleRateHz, and Envelope subtext', () => {
    mockDeviceMemory(8);
    const vlBuf = makeRawUint8Buffer(11_000_000);
    const first = renderBinaryWizard({
      initialEntry: {
        id: 'u8-vl',
        fileName: 'vl.u8',
        buffer: vlBuf,
        binaryConfig: defaultBinaryConfig('vl.u8', vlBuf.byteLength, null),
      },
    });

    const budget = screen.getByTestId('binary-wizard-budget');
    expect(budget).toHaveAttribute('data-budget-level', 'very-large');
    const keepAll = within(budget).getByRole('radio', { name: /Keep all samples/i });
    const decimate = within(budget).getByRole('radio', { name: /Decimate by/i });
    expect(keepAll).toBeEnabled();
    expect(decimate).toBeChecked();
    expect(screen.getByTestId('binary-wizard-keep-all-note')).toHaveTextContent(
      /Not recommended\. Needs about .* free\. Your device reports 8 GB\./,
    );

    const factorInput = screen.getByTestId('binary-wizard-decimate-factor');
    expect(factorInput).toHaveValue(6);
    expect(screen.getByTestId('binary-wizard-decimate-info')).toHaveTextContent('New sample rate: 166.667 kHz · Nyquist: 83.333 kHz');

    // Clear and type '1' then '10' — must not snap mid-typing.
    fireEvent.change(factorInput, { target: { value: '' } });
    expect(factorInput).toHaveValue(null);
    fireEvent.change(factorInput, { target: { value: '1' } });
    expect(factorInput).toHaveValue(1);
    fireEvent.change(factorInput, { target: { value: '10' } });
    expect(factorInput).toHaveValue(10);
    expect(screen.getByTestId('binary-wizard-decimate-info')).toHaveTextContent('New sample rate: 100 kHz · Nyquist: 50 kHz');

    // Setting Rate (Hz) to 0 falls back cleanly when sampleRateHz is null.
    fireEvent.change(screen.getByLabelText('Rate (Hz)'), { target: { value: '0' } });
    const decInfo = screen.getByTestId('binary-wizard-decimate-info');
    expect(decInfo).toHaveTextContent('Sample rate not set (X is sample index) · 1.1 M points');
    expect(decInfo.textContent).not.toContain('. · ');

    expect(budget).toHaveTextContent('Fast. Analysis tools and sample dots are off for this trace.');
    first.unmount();

    // Without navigator.deviceMemory, omit the device memory sentence.
    mockDeviceMemory(undefined);
    renderBinaryWizard({
      initialEntry: {
        id: 'u8-vl-nomem',
        fileName: 'vl_nomem.u8',
        buffer: vlBuf,
        binaryConfig: defaultBinaryConfig('vl_nomem.u8', vlBuf.byteLength, null),
      },
    });
    const note = screen.getByTestId('binary-wizard-keep-all-note');
    expect(note).toHaveTextContent(/Not recommended\. Needs about .* free\./);
    expect(note).not.toHaveTextContent('Your device reports');
  }, 15_000);

  it('shows exceeds-tab warning at 60M points with Keep all enabled and Decimate N=30 selected', () => {
    const hugeBuf = makeRawUint8Buffer(60_000_000);
    renderBinaryWizard({
      initialEntry: {
        id: 'u8-60m',
        fileName: 'huge.u8',
        buffer: hugeBuf,
        binaryConfig: defaultBinaryConfig('huge.u8', hugeBuf.byteLength, null),
      },
    });

    const budget = screen.getByTestId('binary-wizard-budget');
    expect(budget).toHaveAttribute('data-budget-level', 'exceeds-tab');
    expect(within(budget).getByRole('radio', { name: /Keep all samples/i })).toBeEnabled();
    expect(within(budget).getByRole('radio', { name: /Decimate by/i })).toBeChecked();
    expect(screen.getByTestId('binary-wizard-decimate-factor')).toHaveValue(30);
    expect(screen.getByTestId('binary-wizard-keep-all-note')).toHaveTextContent(
      /about 4 GB.*tab will probably crash/i,
    );
  }, 15_000);

  it('normalizes hidden reduction back to full when narrowed to ok', async () => {
    const buf = makeRawUint8Buffer(3_000_000);
    const { getLatest } = renderBinaryWizard({
      initialEntry: {
        id: 'u8-norm',
        fileName: 'norm.u8',
        buffer: buf,
        binaryConfig: defaultBinaryConfig('norm.u8', buf.byteLength, null),
      },
    });

    // Pick envelope, then narrow Samples to 1000 (ok) -> hidden -> confirm must submit mode: 'full'.
    fireEvent.click(screen.getByRole('radio', { name: /Display envelope/i }));
    fireEvent.change(screen.getByLabelText('Samples'), { target: { value: '1000' } });
    expect(screen.queryByTestId('binary-wizard-budget')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('import-wizard-confirm'));
    });

    const fileId1 = getLatest()?.files.files[0]?.id;
    expect(fileId1).toBeDefined();
    expect(getLatest()?.files.binaryConfigByFileId?.[String(fileId1)]?.reduction).toEqual({ mode: 'full' });
    expect(getLatest()?.files.files[0]?.traces[0]?.envelopeOf).toBeUndefined();
  }, 15_000);

  it('preserves envelope and custom decimate factor across RESOLVE_BINARY_WIZARD and RERUN_WIZARD', async () => {
    const buf = makeRawUint8Buffer(3_000_000);
    const rerun1 = renderBinaryWizard({
      initialEntry: {
        id: 'u8-env',
        fileName: 'env.u8',
        buffer: buf,
        binaryConfig: defaultBinaryConfig('env.u8', buf.byteLength, null),
      },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Display envelope/i }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('import-wizard-confirm'));
    });

    const envFile = rerun1.getLatest()?.files.files[0];
    expect(envFile).toBeDefined();
    expect(envFile?.traces[0]?.envelopeOf).toBe(3_000_000);
    expect(rerun1.getLatest()?.files.binaryConfigByFileId?.[String(envFile?.id)]?.reduction).toEqual({
      mode: 'envelope',
      targetPoints: 16_000,
    });

    act(() => {
      rerun1.getLatest()?.dispatch({
        type: 'RERUN_WIZARD',
        payload: { fileId: String(envFile?.id), fileName: 'env.u8' },
      });
    });

    expect(screen.getByRole('radio', { name: /Display envelope/i })).toBeChecked();
    rerun1.unmount();

    const decRender = renderBinaryWizard({
      initialEntry: {
        id: 'u8-dec',
        fileName: 'dec.u8',
        buffer: buf,
        binaryConfig: defaultBinaryConfig('dec.u8', buf.byteLength, null),
      },
    });
    const factorInput = screen.getByTestId('binary-wizard-decimate-factor');
    fireEvent.focus(factorInput);
    fireEvent.change(factorInput, { target: { value: '9' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('import-wizard-confirm'));
    });

    expect(screen.queryByTestId('binary-wizard')).toBeNull();
    const decFile = decRender.getLatest()?.files.files[0];
    expect(decFile).toBeDefined();
    expect(decRender.getLatest()?.files.binaryConfigByFileId?.[String(decFile?.id)]?.reduction).toEqual({
      mode: 'decimate',
      factor: 9,
    });

    act(() => {
      decRender.getLatest()?.dispatch({
        type: 'RERUN_WIZARD',
        payload: { fileId: String(decFile?.id), fileName: 'dec.u8' },
      });
    });

    expect(screen.getByRole('radio', { name: /Decimate by/i })).toBeChecked();
    expect(screen.getByTestId('binary-wizard-decimate-factor')).toHaveValue(9);
  }, 15_000);

  it('blocks raw-mode startSample overshoot leaving fewer than two samples and disables confirm', () => {
    const buf = makeRawUint8Buffer(3_000_000);
    renderBinaryWizard({
      initialEntry: {
        id: 'u8-overshoot',
        fileName: 'overshoot.u8',
        buffer: buf,
        binaryConfig: defaultBinaryConfig('overshoot.u8', buf.byteLength, null),
      },
    });

    const startInput = screen.getByLabelText('Start');
    const confirmBtn = screen.getByTestId('import-wizard-confirm');
    expect(confirmBtn).toBeEnabled();
    expect(screen.queryByTestId('import-wizard-blocker')).toBeNull();

    // Overshoot past totalAvailableSamples -> budget hides, blocker renders, confirm disabled.
    fireEvent.change(startInput, { target: { value: '5000000' } });
    expect(screen.queryByTestId('binary-wizard-budget')).toBeNull();
    expect(screen.getByTestId('import-wizard-blocker')).toHaveTextContent('Selected sample window has fewer than two samples.');
    expect(confirmBtn).toBeDisabled();

    // Only 1 trailing sample left -> still blocked.
    fireEvent.change(startInput, { target: { value: '2999999' } });
    expect(screen.getByTestId('import-wizard-blocker')).toHaveTextContent('Selected sample window has fewer than two samples.');
    expect(confirmBtn).toBeDisabled();

    // Exactly 2 trailing samples left -> allowed.
    fireEvent.change(startInput, { target: { value: '2999998' } });
    expect(screen.queryByTestId('import-wizard-blocker')).toBeNull();
    expect(confirmBtn).toBeEnabled();
  });

  it('formats decimatedRateInfo cleanly without ". · " when sampleRateHz is null for both index and non-index X axes', () => {
    const rawBuf = makeRawUint8Buffer(3_000_000);
    const rawCfg = defaultBinaryConfig('index_only.u8', rawBuf.byteLength, null);
    const rawRender = renderBinaryWizard({
      initialEntry: {
        id: 'u8-null-rate',
        fileName: 'index_only.u8',
        buffer: rawBuf,
        binaryConfig: { ...rawCfg, sampleRateHz: 0 },
      },
    });

    const rawInfo = screen.getByTestId('binary-wizard-decimate-info');
    expect(rawInfo.textContent).toBe('Sample rate not set (X is sample index) · 1.5 M points');
    expect(rawInfo.textContent).not.toContain('. · ');
    rawRender.unmount();

    // Frequency-domain scope capture (xUnits = 6 -> Hz) has sampleRateHz === null but non-index X units.
    const freqWavebinBuf = makeWavebinBuffer([{ label: 'CH1', sampleCount: 2_500_000 }], 6);
    renderBinaryWizard({
      initialEntry: {
        id: 'wb-freq',
        fileName: 'spectrum.bin',
        buffer: freqWavebinBuf,
        binaryConfig: defaultBinaryConfig('spectrum.bin', freqWavebinBuf.byteLength, 'wavebin'),
      },
    });

    const freqInfo = screen.getByTestId('binary-wizard-decimate-info');
    expect(freqInfo.textContent).toBe('Sample rate unavailable · 1.25 M points');
    expect(freqInfo.textContent).not.toContain('X is sample index');
    expect(freqInfo.textContent).not.toContain('. · ');
  }, 15_000);
});
