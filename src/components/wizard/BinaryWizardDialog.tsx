import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFileDispatch } from '../../stores/file-store';
import type { WizardEntry } from '../../stores/file-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { useAsk } from '../../stores/dialog-store';
import { replaceWorkspaceText, sameNameText } from '../../domain/confirm-text';
import { copyName } from '../../domain/open-files-plan';
import { workspaceCounts } from '../../hooks/use-file-import';
import { useTraceState } from '../../stores/trace-store';
import type { OpenChoice } from '../../types/open-files-plan';
import type { RawFileRecord } from '../../types/file';
import { BINARY_SNIFF_BYTES, classifyBinaryConfidence, detectBinarySignature } from '../../domain/parsers/binary-detect';
import type { BinaryFormat } from '../../domain/parsers/binary-detect';
import {
  BINARY_RAW_PRESETS,
  channelsPerFrame,
  defaultBinaryConfig,
  detectBinaryDataStart,
  parseBinarySettings,
  previewBinaryImport,
  rawTotalSamples,
  scopeFormatLabel,
  serializeBinarySettings,
} from '../../domain/parsers/raw-binary';
import type {
  BinaryChannelLayout,
  BinaryChannelOverride,
  BinaryEndian,
  BinaryImportConfig,
  BinaryParserChoice,
  BinaryPreviewChannel,
  BinarySampleType,
  BinaryXDomain,
} from '../../domain/parsers/raw-binary';
import { defaultBinaryReduction } from '../../domain/parsers/binary-reduce';
import { pointBudget, recommendedDecimateFactor } from '../../domain/point-budget';
import { formatCount } from '../../domain/import-wizard';
import { parseEngInput } from '../../domain/units';
import { useWizardTraceColors } from '../../hooks/use-wizard-trace-colors';
import { Btn } from '../shared/Btn';
import { Icon, MessageBar, PopoverAt, Segmented } from '../shared/Controls';
import { CaretDownIcon } from '../shared/Icons';
import { CONFIDENCE_ICON, CONFIDENCE_LABEL } from './WizardSettings';
import { WizardPreviewPlot } from './WizardPreviewPlot';
import { BinaryPointBudgetBanner, DEFAULT_ENVELOPE_TARGET } from './BinaryPointBudgetBanner';
import type { BinaryPointBudgetStats } from './BinaryPointBudgetBanner';
import { BinaryHexInspector } from './BinaryHexInspector';

const SAMPLE_TYPES: readonly { value: BinarySampleType; label: string; ariaLabel: string; title: string }[] = [
  { value: 'float32', label: 'f32', ariaLabel: 'Float 32-bit', title: 'IEEE-754 32-bit floating point (4 bytes/sample; standard for GNU Radio, Keysight, Rigol)' },
  { value: 'int16', label: 'i16', ariaLabel: 'Signed 16-bit integer', title: 'Signed 16-bit integer (-32768..32767, 2 bytes/sample; common for ADCs, USRP, BladeRF, WAV)' },
  { value: 'int8', label: 'i8', ariaLabel: 'Signed 8-bit integer', title: 'Signed 8-bit integer (-128..127, 1 byte/sample; HackRF & 8-bit oscilloscopes)' },
  { value: 'uint8', label: 'u8', ariaLabel: 'Unsigned 8-bit integer', title: 'Unsigned 8-bit integer (0..255, 1 byte/sample; RTL-SDR .cu8 & raw 8-bit dumps)' },
];

const EXTRA_SAMPLE_TYPES: readonly { value: BinarySampleType; label: string; ariaLabel: string; title: string }[] = [
  { value: 'float64', label: 'f64', ariaLabel: 'Float 64-bit', title: 'IEEE-754 64-bit double-precision float (8 bytes/sample; MATLAB / NumPy float64)' },
  { value: 'float16', label: 'f16', ariaLabel: 'Float 16-bit', title: 'IEEE-754 16-bit half-precision float (2 bytes/sample; NumPy float16 / DSP / FPGA)' },
  { value: 'int32', label: 'i32', ariaLabel: 'Signed 32-bit integer', title: 'Signed 32-bit integer (4 bytes/sample; FPGA / high-resolution DAQ dumps)' },
  { value: 'uint32', label: 'u32', ariaLabel: 'Unsigned 32-bit integer', title: 'Unsigned 32-bit integer (4 bytes/sample; raw counters / unsigned ADC words)' },
  { value: 'int24', label: 'i24', ariaLabel: 'Signed 24-bit integer', title: 'Signed 24-bit integer (3 bytes/sample; 24-bit Σ-Δ ADCs / PCM audio / DAQ)' },
  { value: 'uint24', label: 'u24', ariaLabel: 'Unsigned 24-bit integer', title: 'Unsigned 24-bit integer (3 bytes/sample; unipolar 24-bit ADC streams)' },
  { value: 'uint16', label: 'u16', ariaLabel: 'Unsigned 16-bit integer', title: 'Unsigned 16-bit integer (0..65535, 2 bytes/sample; unipolar ADCs)' },
];

const ENDIANS: readonly { value: BinaryEndian; label: string; ariaLabel: string; title: string }[] = [
  { value: 'le', label: 'LE', ariaLabel: 'Little-endian', title: 'Little-endian: least-significant byte first (standard on x86/ARM PCs, Keysight, Rigol, GNU Radio)' },
  { value: 'be', label: 'BE', ariaLabel: 'Big-endian', title: 'Big-endian: most-significant byte first (network byte order, older Tektronix/LeCroy scopes)' },
];

const LAYOUTS: readonly { value: BinaryChannelLayout; label: string; ariaLabel: string; title: string }[] = [
  { value: 'real', label: 'Real', ariaLabel: 'Single real channel', title: 'Single real-valued stream: [s0, s1, s2, …] plotted as CH1' },
  { value: 'iq', label: 'IQ', ariaLabel: 'Complex IQ (I and Q)', title: 'Interleaved complex IQ pairs: [I0, Q0, I1, Q1, …] plotted as I and Q' },
  { value: 'interleaved', label: 'Interl.', ariaLabel: 'Interleaved multi-channel', title: 'Interleaved multi-channel frames: [CH1, CH2, …, CH1, CH2, …] per sample instant' },
  { value: 'planar', label: 'Planar', ariaLabel: 'Sequential (planar) multi-channel', title: 'Sequential (planar) blocks: all of CH1 stored back-to-back, followed by all of CH2, …' },
];

const X_DOMAINS: readonly { value: BinaryXDomain; label: string; ariaLabel: string; title: string }[] = [
  { value: 'time', label: 'Time (s)', ariaLabel: 'Time domain in seconds', title: 'Time-domain waveform spaced by Sample Rate (Hz)' },
  { value: 'frequency', label: 'Freq (Hz)', ariaLabel: 'Frequency sweep in hertz', title: 'Spectrum analyzer / frequency sweep linearly spaced from Start freq to Stop freq (Hz)' },
  { value: 'index', label: 'Index', ariaLabel: 'Unitless sample index', title: 'Plot raw sample index (0, 1, 2, …) without a physical X unit' },
];

const Y_QUICK: readonly { value: string; label: string; ariaLabel: string; title: string }[] = [
  { value: '__auto', label: 'Auto', ariaLabel: 'Default unit', title: 'Keep the unit declared by the file header (or unitless for raw binary)' },
  { value: 'V', label: 'V', ariaLabel: 'volts (V)', title: 'Override vertical axis unit to volts (V)' },
  { value: 'mV', label: 'mV', ariaLabel: 'millivolts (mV)', title: 'Override vertical axis unit to millivolts (mV)' },
  { value: 'A', label: 'A', ariaLabel: 'amperes (A)', title: 'Override vertical axis unit to amperes (A) — e.g. current probe' },
  { value: 'dBm', label: 'dBm', ariaLabel: 'dB milliwatt (dBm)', title: 'Override vertical axis unit to dBm' },
];

const Y_EXTRA: readonly { value: string; label: string; title: string }[] = [
  { value: 'dB', label: 'dB', title: 'Override vertical axis unit to decibels (dB)' },
  { value: 'mA', label: 'mA', title: 'Override vertical axis unit to milliamperes (mA)' },
  { value: 'W', label: 'W', title: 'Override vertical axis unit to watts (W)' },
  { value: '', label: 'No unit', title: 'Display raw unitless numeric values' },
];

const CHANNEL_UNITS: readonly { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'Auto' },
  { value: 'V', label: 'V' },
  { value: 'mV', label: 'mV' },
  { value: 'A', label: 'A' },
  { value: 'mA', label: 'mA' },
  { value: 'dBm', label: 'dBm' },
  { value: 'dB', label: 'dB' },
  { value: 'W', label: 'W' },
  { value: '', label: 'None' },
];

const EXPLICIT_PARSERS: readonly { value: BinaryFormat; label: string; title: string }[] = [
  { value: 'wavebin', label: 'Keysight / Rigol (.bin)', title: 'Force Keysight/Agilent (AG) or Rigol (RG) binary waveform parser' },
  { value: 'lecroy-trc', label: 'LeCroy (.trc)', title: 'Force Teledyne LeCroy WAVEDESC / LECROY_2_3 parser' },
  { value: 'tek-isf', label: 'Tektronix (.isf)', title: 'Force Tektronix Internal Save Format (:WFMPRE: + :CURVE #) parser' },
  { value: 'owon-bin', label: 'OWON (.bin)', title: 'Force OWON SPBXDS + JSON header parser' },
  { value: 'wav', label: 'RIFF / WAV (.wav)', title: 'Force RIFF/WAVE PCM or IEEE Float audio/DAQ/IQ parser' },
  { value: 'npy', label: 'NumPy (.npy)', title: 'Force NumPy .npy binary array parser (1D/2D real or complex)' },
];

function enterIsTaken(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('.ui-popover')) return true;
  return target instanceof HTMLButtonElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

function isChannelEnabled(index: number, config: BinaryImportConfig): boolean {
  const override = config.channelOverrides?.[index];
  if (override?.enabled !== undefined) return override.enabled;
  if (config.selectedChannels !== undefined) return config.selectedChannels.includes(index);
  return true;
}

function readDeviceMemoryGb(): number | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as Navigator & { readonly deviceMemory?: unknown };
  return typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory) && nav.deviceMemory > 0
    ? nav.deviceMemory
    : undefined;
}

function computeBinaryPointStats(
  byteLength: number,
  config: BinaryImportConfig,
  allScopeChannels: readonly BinaryPreviewChannel[],
  hasScopeSignature: boolean,
): BinaryPointBudgetStats {
  const start = Math.max(0, Math.floor(Number.isFinite(config.startSample) ? config.startSample : 0));
  const requested = Math.max(0, Math.floor(Number.isFinite(config.sampleCount) ? config.sampleCount : 0));

  if (config.mode === 'auto-scope' && hasScopeSignature) {
    if (allScopeChannels.length === 0) {
      return { channelCount: 0, perChannelSamples: 0, totalPoints: 0, budget: pointBudget(0) };
    }
    const enabled = allScopeChannels.filter(ch => isChannelEnabled(ch.index, config));
    let totalPoints = 0;
    let commonSlice: number | null = null;
    let equal = true;
    for (const ch of enabled) {
      const avail = Math.max(0, ch.points - start);
      const slice = requested > 0 ? Math.min(requested, avail) : avail;
      totalPoints += slice;
      if (commonSlice === null) commonSlice = slice;
      else if (commonSlice !== slice) equal = false;
    }
    return {
      channelCount: enabled.length,
      perChannelSamples: enabled.length > 0 && equal ? commonSlice : null,
      totalPoints,
      budget: pointBudget(totalPoints),
    };
  }

  const channelCount = channelsPerFrame(config);
  const totalFrames = rawTotalSamples(byteLength, config);
  const avail = Math.max(0, totalFrames - start);
  const slice = requested > 0 ? Math.min(requested, avail) : avail;
  const totalPoints = channelCount * slice;
  return {
    channelCount,
    perChannelSamples: slice,
    totalPoints,
    budget: pointBudget(totalPoints),
  };
}

function formatCompactNum(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e6) return Number(value.toPrecision(6)).toString();
  return value.toExponential(4);
}

export interface BinaryWizardDialogProps {
  entry: WizardEntry;
  buffer: ArrayBuffer;
  position: number;
  total: number;
  others?: readonly WizardEntry[];
  queue: readonly WizardEntry[];
  priorFile: RawFileRecord | undefined;
}

export function BinaryWizardDialog({ entry, buffer, position, total, others = [], queue, priorFile }: BinaryWizardDialogProps) {
  const fileDispatch = useFileDispatch();
  const aggregate = useOptionalAggregateWorkspace();
  const ask = useAsk();
  const asking = useRef(false);
  const { allKnownTraces } = useTraceState();
  const dialogRef = useRef<HTMLDivElement>(null);
  const editing = entry.mode === 'edit';

  const detectedScope = useMemo(
    () => detectBinarySignature(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, BINARY_SNIFF_BYTES))),
    [buffer],
  );

  const [config, setConfig] = useState<BinaryImportConfig>(
    () => entry.binaryConfig ?? defaultBinaryConfig(entry.fileName, buffer.byteLength, detectedScope),
  );
  const [applyToOthers, setApplyToOthers] = useState(false);
  const [hexSize, setHexSize] = useState<number>(64);
  const [hexPageOffset, setHexPageOffset] = useState<number | null>(null);
  const [selectedHexByte, setSelectedHexByte] = useState<number | null>(null);
  const [autoSkipHint, setAutoSkipHint] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const settingsFileInputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(
    () => previewBinaryImport(buffer, entry.fileName, config, {
      ...(hexPageOffset !== null ? { offset: hexPageOffset } : {}),
      maxBytes: hexSize,
    }),
    [buffer, entry.fileName, config, hexPageOffset, hexSize],
  );
  const effectiveScope = config.mode === 'auto-scope'
    ? (config.parserOverride && config.parserOverride !== 'auto' ? config.parserOverride : detectedScope)
    : null;
  const pointStats = useMemo(
    () => computeBinaryPointStats(buffer.byteLength, config, preview.allScopeChannels, effectiveScope !== null),
    [buffer.byteLength, config, preview.allScopeChannels, effectiveScope],
  );
  const recommendedFactor = Math.max(2, recommendedDecimateFactor(pointStats.totalPoints));
  const deviceMemoryGb = useMemo(() => readDeviceMemoryGb(), []);
  const [userPickedReduction, setUserPickedReduction] = useState(
    () => editing && entry.binaryConfig?.reduction !== undefined && pointStats.budget.level !== 'ok',
  );
  const [decimateDraft, setDecimateDraft] = useState(() => (
    config.reduction?.mode === 'decimate' && config.reduction.factor >= 2
      ? String(Math.floor(config.reduction.factor))
      : String(recommendedFactor)
  ));

  const [parserMoreAnchor, setParserMoreAnchor] = useState<HTMLElement | null>(null);
  const [typeMoreAnchor, setTypeMoreAnchor] = useState<HTMLElement | null>(null);
  const [yMoreAnchor, setYMoreAnchor] = useState<HTMLElement | null>(null);
  const [chUnitPopover, setChUnitPopover] = useState<{ index: number; anchor: HTMLElement } | null>(null);

  const [rateDraft, setRateDraft] = useState(() => (config.sampleRateHz > 0 ? String(config.sampleRateHz) : '0'));
  const [freqStartDraft, setFreqStartDraft] = useState(() => formatCompactNum(config.freqStartHz ?? 0));
  const [freqStopDraft, setFreqStopDraft] = useState(() => formatCompactNum(config.freqStopHz ?? 1e9));
  const [yMultDraft, setYMultDraft] = useState(() => formatCompactNum(config.yMult));
  const [yOffsetDraft, setYOffsetDraft] = useState(() => formatCompactNum(config.yOffset));
  const [xMultDraft, setXMultDraft] = useState(() => formatCompactNum(config.xMult));
  const [xOffsetDraft, setXOffsetDraft] = useState(() => formatCompactNum(config.xOffset ?? 0));
  const [chDrafts, setChDrafts] = useState<Record<string, string>>({});

  const skipId = useId();
  const padId = useId();
  const footerId = useId();
  const rateId = useId();
  const freqStartId = useId();
  const freqStopId = useId();
  const startId = useId();
  const countId = useId();
  const multId = useId();
  const offId = useId();
  const xMultId = useId();
  const xOffId = useId();
  const chCountId = useId();
  const reductionGroupName = useId();

  useEffect(() => {
    if (pointStats.budget.level === 'ok') {
      setUserPickedReduction(prev => (prev ? false : prev));
      setConfig(prev => (
        prev.reduction?.mode === 'full'
          ? prev
          : { ...prev, reduction: { mode: 'full' } }
      ));
      setDecimateDraft(prev => (prev === '2' ? prev : '2'));
      return;
    }

    if (!userPickedReduction) {
      const nextDefault = defaultBinaryReduction(pointStats.totalPoints);
      setConfig(prev => {
        const cur = prev.reduction;
        if (nextDefault.mode === 'full' && cur?.mode === 'full') return prev;
        if (
          nextDefault.mode === 'decimate'
          && cur?.mode === 'decimate'
          && cur.factor === nextDefault.factor
        ) {
          return prev;
        }
        return { ...prev, reduction: nextDefault };
      });
      setDecimateDraft(String(recommendedFactor));
      return;
    }

    if (config.reduction?.mode !== 'decimate') {
      setDecimateDraft(String(recommendedFactor));
    }
  }, [pointStats.budget.level, pointStats.totalPoints, recommendedFactor, userPickedReduction, config.reduction?.mode]);

  // Match existing traces for colour preservation in Edit mode.
  const keepIds = useMemo(() => {
    if (!priorFile) return preview.channels.map(() => null);
    const displays = priorFile.displayTraces ?? [];
    const identities = priorFile.columnIdentities ?? [];
    return preview.channels.map(ch => {
      const idx = identities.findIndex(id => id.header === ch.label);
      const display = idx >= 0 ? displays[idx] : undefined;
      const trace = display ? allKnownTraces.find(item => item.id === display.id || item.parameters?.['displayTraceId'] === display.id) : undefined;
      return trace?.id ?? null;
    });
  }, [priorFile, preview.channels, allKnownTraces]);
  const yColors = useWizardTraceColors(keepIds, []);

  const startSample = Math.max(0, Math.floor(Number.isFinite(config.startSample) ? config.startSample : 0));
  const requestedSamples = Math.max(0, Math.floor(Number.isFinite(config.sampleCount) ? config.sampleCount : 0));
  const rawWindowTooSmall = (config.mode === 'raw' || effectiveScope === null)
    && preview.totalAvailableSamples > 0
    && (Math.max(0, preview.totalAvailableSamples - startSample) < 2 || requestedSamples === 1);
  const blocker = preview.error ?? (rawWindowTooSmall ? 'Selected sample window has fewer than two samples.' : null);

  const resolveDecisions = async (batchId: string, resolving: readonly WizardEntry[]) => {
    const batch = resolving.find(item => item.pendingBatch?.id === batchId)?.pendingBatch;
    const decisions: Record<string, { choice: OpenChoice; expectedFileId?: string }> = {};
    let workspaceChoice: 'replace' | undefined;
    if (!batch || !aggregate) return { ok: true as const, decisions, workspaceChoice };
    const current = aggregate.state;
    if (batch.workspace) {
      const counts = workspaceCounts(current);
      if (counts) { if (await ask(replaceWorkspaceText(counts)) !== 'confirm') return { ok: false as const }; workspaceChoice = 'replace'; }
    }
    const opened = batch.workspace?.snapshot.files ?? current.files.files;
    const names = new Set(opened.map(file => file.fileName));
    for (const input of batch.inputs) {
      const existing = opened.find(file => file.fileName === input.name);
      if (!existing || input.choice === 'copy' || (input.choice === 'replace' && input.expectedFileId === String(existing.id))) continue;
      const answer = await ask(sameNameText(input.name, copyName(input.name, names)));
      if (answer === 'cancel') return { ok: false as const };
      const choice: OpenChoice = answer === 'confirm' ? 'replace' : 'copy';
      if (choice === 'copy') names.add(copyName(input.name, names));
      decisions[input.id] = { choice, expectedFileId: choice === 'replace' ? String(existing.id) : undefined };
    }
    return { ok: true as const, decisions, workspaceChoice };
  };

  const confirm = async () => {
    if (blocker || asking.current) return;
    const resolving = [entry, ...(applyToOthers ? others : [])];
    const finalFor = new Map<string, { decisions: Record<string, { choice: OpenChoice; expectedFileId?: string }>; workspaceChoice?: 'replace' }>();
    for (const item of resolving) {
      const batchId = item.pendingBatch?.id;
      if (!batchId || finalFor.has(batchId)) continue;
      const left = queue.filter(other => other.pendingBatch?.id === batchId && !resolving.includes(other));
      if (left.length) continue;
      asking.current = true;
      const answer = await resolveDecisions(batchId, resolving).finally(() => { asking.current = false; });
      if (!answer.ok) return;
      finalFor.set(batchId, { decisions: answer.decisions, workspaceChoice: answer.workspaceChoice });
    }
    const normalizedConfig: BinaryImportConfig = (() => {
      if (pointStats.budget.level === 'ok') {
        return { ...config, reduction: { mode: 'full' } };
      }
      if (config.reduction?.mode === 'decimate') {
        const trimmed = decimateDraft.trim();
        const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
        const factor = Number.isSafeInteger(parsed) && parsed >= 2
          ? parsed
          : (Number.isSafeInteger(config.reduction.factor) && config.reduction.factor >= 2
            ? Math.floor(config.reduction.factor)
            : recommendedFactor);
        return { ...config, reduction: { mode: 'decimate', factor } };
      }
      if (config.reduction === undefined) {
        return { ...config, reduction: defaultBinaryReduction(pointStats.totalPoints) };
      }
      return config;
    })();
    resolving.forEach(item => {
      const batchId = item.pendingBatch?.id;
      const isLast = batchId ? resolving.filter(other => other.pendingBatch?.id === batchId).at(-1) === item : true;
      const extra = batchId && isLast ? finalFor.get(batchId) : undefined;
      fileDispatch({
        type: 'RESOLVE_BINARY_WIZARD',
        payload: {
          id: item.id,
          binaryConfig: normalizedConfig,
          ...(extra ? { decisions: extra.decisions, workspaceChoice: extra.workspaceChoice } : {}),
        },
      });
    });
  };

  const skipFile = () => fileDispatch({ type: 'SKIP_WIZARD', payload: { id: entry.id } });
  const cancel = () => (editing ? skipFile() : fileDispatch({ type: 'SKIP_ALL_WIZARD' }));
  const switchToText = () => {
    setParserMoreAnchor(null);
    fileDispatch({ type: 'SWITCH_WIZARD_TO_TEXT', payload: { id: entry.id } });
  };

  const confirmRef = useRef(confirm); confirmRef.current = confirm;
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || asking.current) return;
      if (event.key === 'Escape') { event.preventDefault(); cancelRef.current(); }
      else if (event.key === 'Enter' && !enterIsTaken(event.target)) { event.preventDefault(); void confirmRef.current(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const extraTypeActive = EXTRA_SAMPLE_TYPES.some(item => item.value === config.sampleType);
  const extraTypeFace = EXTRA_SAMPLE_TYPES.find(item => item.value === config.sampleType)?.label ?? 'More';

  const yQuickValue = config.yUnit === undefined ? '__auto' : Y_QUICK.some(o => o.value === config.yUnit) ? config.yUnit : null;
  const yExtraFace = yQuickValue === null ? (config.yUnit === '' ? 'None' : config.yUnit ?? 'More') : 'More';

  const activeParserChoice: BinaryParserChoice = config.parserOverride ?? 'auto';
  const explicitParserActive = config.mode === 'auto-scope' && activeParserChoice !== 'auto';
  const parserMoreFace = explicitParserActive
    ? (EXPLICIT_PARSERS.find(p => p.value === activeParserChoice)?.label.split(' ')[0] ?? 'Format')
    : 'Format';

  const updateChannelOverride = (chIndex: number, patch: Partial<BinaryChannelOverride>) => {
    setConfig(prev => {
      const current = prev.channelOverrides?.[chIndex] ?? {};
      const merged: BinaryChannelOverride = { ...current, ...patch };
      const nextOverrides = { ...(prev.channelOverrides ?? {}), [chIndex]: merged };
      // Keep legacy selectedChannels cleared once per-channel overrides manage enabled state.
      const nextSelected = prev.selectedChannels
        ? (patch.enabled === false
          ? prev.selectedChannels.filter(i => i !== chIndex)
          : patch.enabled === true
            ? [...new Set([...prev.selectedChannels, chIndex])].sort((a, b) => a - b)
            : prev.selectedChannels)
        : undefined;
      return { ...prev, selectedChannels: nextSelected, channelOverrides: nextOverrides };
    });
  };

  const applyRawPreset = (patch: Partial<BinaryImportConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      setYMultDraft(formatCompactNum(next.yMult));
      setYOffsetDraft(formatCompactNum(next.yOffset));
      return next;
    });
  };

  const nudgeSkip = (delta: number) => {
    setHexPageOffset(null);
    setAutoSkipHint(null);
    setConfig(prev => ({
      ...prev,
      headerBytes: Math.max(0, Math.min(Math.max(0, buffer.byteLength - 2), prev.headerBytes + delta)),
    }));
  };

  const autoSkipHeader = () => {
    const result = detectBinaryDataStart(buffer);
    const clamped = Math.max(0, Math.min(Math.max(0, buffer.byteLength - 2), result.offset));
    setHexPageOffset(null);
    setConfig(prev => ({
      ...prev,
      headerBytes: clamped,
    }));
    setAutoSkipHint(
      result.detected
        ? `Jumped to ${formatCount(clamped)} B (${result.reason}).`
        : 'No known header found (0 B) — inspect hex on the right and click Set skip.',
    );
  };

  const exportBinarySettings = () => {
    const json = serializeBinarySettings(config);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stem = entry.fileName.replace(/\.[^.]+$/, '') || 'binary';
    link.href = url;
    link.download = `${stem}.binary-import.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSettingsNotice('Exported binary import settings JSON.');
  };

  const importBinarySettings = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseBinarySettings(text, config);
      if (!parsed.ok) {
        setSettingsNotice(parsed.error);
        return;
      }
      const next = parsed.config;
      setHexPageOffset(null);
      setConfig(next);
      setRateDraft(next.sampleRateHz > 0 ? String(next.sampleRateHz) : '0');
      setFreqStartDraft(formatCompactNum(next.freqStartHz ?? 0));
      setFreqStopDraft(formatCompactNum(next.freqStopHz ?? 1e9));
      setYMultDraft(formatCompactNum(next.yMult));
      setYOffsetDraft(formatCompactNum(next.yOffset));
      setXMultDraft(formatCompactNum(next.xMult));
      setXOffsetDraft(formatCompactNum(next.xOffset ?? 0));
      setSettingsNotice(`Loaded settings from ${file.name}.`);
    } catch {
      setSettingsNotice('Could not read settings file.');
    }
  };

  const isPresetActive = (patch: Partial<BinaryImportConfig>): boolean => (
    config.mode === 'raw'
    && config.sampleType === patch.sampleType
    && config.endian === patch.endian
    && config.layout === patch.layout
    && Boolean(config.swapIQ) === Boolean(patch.swapIQ)
    && Math.abs(config.yMult - (patch.yMult ?? 1)) < 1e-9
    && Math.abs(config.yOffset - (patch.yOffset ?? 0)) < 1e-9
  );

  const confidence = useMemo(
    () => classifyBinaryConfidence({
      mode: config.mode,
      detectedScope,
      parserOverride: config.parserOverride,
      fileName: entry.fileName,
      warning: entry.binaryWarning,
    }),
    [config.mode, detectedScope, config.parserOverride, entry.fileName, entry.binaryWarning],
  );
  const confidencePct = Math.round(Math.max(0, Math.min(1, confidence.score)) * 100);

  const activeReductionMode: 'full' | 'decimate' | 'envelope' = config.reduction?.mode
    ?? defaultBinaryReduction(pointStats.totalPoints).mode;
  const parsedDecimateDraft = /^\d+$/.test(decimateDraft.trim()) ? Number(decimateDraft.trim()) : Number.NaN;
  const displayDecimateFactor = Number.isSafeInteger(parsedDecimateDraft) && parsedDecimateDraft >= 2
    ? parsedDecimateDraft
    : (config.reduction?.mode === 'decimate' && config.reduction.factor >= 2
      ? Math.floor(config.reduction.factor)
      : recommendedFactor);

  const selectDecimateReduction = () => {
    setUserPickedReduction(true);
    const factor = Number.isSafeInteger(parsedDecimateDraft) && parsedDecimateDraft >= 2
      ? parsedDecimateDraft
      : recommendedFactor;
    setConfig(prev => (
      prev.reduction?.mode === 'decimate' && prev.reduction.factor === factor
        ? prev
        : { ...prev, reduction: { mode: 'decimate', factor } }
    ));
  };

  const activeXDomain: BinaryXDomain = config.xDomain ?? (config.sampleRateHz > 0 ? 'time' : 'index');
  const mainLabel = editing ? 'Apply' : `Add ${preview.channels.length} trace${preview.channels.length === 1 ? '' : 's'}`;

  return (
    <div className="ui-dialog-backdrop">
      <div ref={dialogRef} className="ui-dialog iw-dialog iw-dialog--binary" role="dialog" aria-modal="true" aria-labelledby="binary-wizard-title" data-testid="binary-wizard" tabIndex={-1}>
        <header className="iw-head">
          <h2 id="binary-wizard-title" className="iw-title t-title">
            {editing ? 'Import settings' : 'Open'} <span className="iw-file" title={entry.fileName}>{entry.fileName}</span>
          </h2>
          {total > 1 && <span className="t-caption" data-testid="import-wizard-queue">File {position} of {total}</span>}
          <button type="button" className="iw-close" aria-label="Close" title="Cancel (Esc)" onClick={cancel}><Icon name="close" /></button>
        </header>

        <div className="iw-mode-bar" data-testid="import-wizard-mode-bar">
          <span className="t-label t-muted">Import as</span>
          <div className="iw-mode-switch">
            <Segmented
              label="Import mode"
              options={[
                { value: 'text', label: 'Text / Table', title: 'Parse delimited CSV, TSV, or ASCII table columns' },
                { value: 'binary', label: 'Binary / Waveform', title: 'Decode binary oscilloscope, WAV, NumPy, SDR IQ, SA sweep, or raw binary streams' },
              ]}
              value="binary"
              onChange={mode => { if (mode === 'text') switchToText(); }}
            />
          </div>
          <span className="t-caption t-muted iw-mode-hint">Wrong view? Switch anytime without losing the file.</span>
        </div>

        <div className="iw-body">
          <div className="iw-settings">
            <section className="iw-group" aria-label="Auto-detect confidence">
              <div
                className={`iw-detect is-${confidence.level}`}
                data-testid="binary-wizard-confidence"
                data-confidence-level={confidence.level}
                title="How confident Mergen Scope is in the detected binary format"
              >
                <span className={`iw-detect-icon is-${confidence.level}`}>
                  <Icon name={CONFIDENCE_ICON[confidence.level]} />
                </span>
                <span className="t-label">{CONFIDENCE_LABEL[confidence.level]} · {confidencePct}%</span>
                <span className="t-caption">{confidence.label}</span>
              </div>
              {confidence.level === 'low' && confidence.reasons.length > 0 && (
                <div data-testid="binary-wizard-reasons">
                  <MessageBar status="warning">
                    {confidence.reasons.map(reason => reason.replace(/\.$/, '')).join('. ')}.
                    {!entry.binaryWarning ? ' Check parser or raw settings before importing.' : ''}
                  </MessageBar>
                </div>
              )}
              {confidence.level !== 'low' && confidence.reasons.length > 0 && (
                <ul className="iw-reasons" data-testid="binary-wizard-reasons">
                  {confidence.reasons.map((reason, index) => (
                    <li key={index} className="t-caption">{reason}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="iw-group" aria-label="Parser">
              <h3 className="t-section">File format</h3>
              <div className="iw-seg">
                <div className="ui-segmented" role="radiogroup" aria-label="Parser mode">
                  <Btn
                    role="radio"
                    variant="slate"
                    active={config.mode === 'auto-scope'}
                    aria-checked={config.mode === 'auto-scope'}
                    disabled={!detectedScope && activeParserChoice === 'auto'}
                    title={detectedScope ? `Parse using the oscilloscope file header (${scopeFormatLabel(detectedScope)})` : 'No scope header detected — pick a format from Format ▾ or use Custom'}
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'auto-scope' }))}
                  >
                    Scope header
                  </Btn>
                  <Btn
                    role="radio"
                    variant="slate"
                    active={config.mode === 'raw'}
                    aria-checked={config.mode === 'raw'}
                    aria-label="Custom raw binary"
                    title="Custom binary mode: decode any raw/proprietary binary file with custom data type, endianness, layout, header skip, frame pad, footer, and sample rate"
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'raw' }))}
                  >
                    Custom
                  </Btn>
                  <Btn
                    variant="slate"
                    active={explicitParserActive || Boolean(parserMoreAnchor)}
                    aria-label="Choose parser format"
                    title="Force a specific instrument parser or switch to the Text / CSV importer"
                    aria-haspopup="menu"
                    aria-expanded={Boolean(parserMoreAnchor)}
                    onClick={event => {
                      const target = event.currentTarget;
                      setParserMoreAnchor(cur => (cur ? null : target));
                    }}
                  >
                    <span className="iw-more-face">{parserMoreFace}<CaretDownIcon /></span>
                  </Btn>
                </div>
              </div>
              <span className="t-caption" data-testid="binary-wizard-detected">
                {config.mode === 'raw'
                  ? 'Custom binary decoding'
                  : activeParserChoice !== 'auto'
                    ? `Forced: ${scopeFormatLabel(activeParserChoice)}`
                    : `Detected: ${scopeFormatLabel(detectedScope)}`}
              </span>
            </section>

            {config.mode === 'auto-scope' && preview.allScopeChannels.length > 0 && (
              <section className="iw-group" aria-label="Channels">
                <h3 className="t-section">Channels</h3>
                <div className="iw-chan-table" data-testid="binary-wizard-channels">
                  <div className="iw-chan-head t-caption" aria-hidden="true">
                    <span>Channel</span>
                    <span>Unit</span>
                    <span>Scale ×</span>
                    <span>Offset</span>
                  </div>
                  {preview.allScopeChannels.map(ch => {
                    const ov = config.channelOverrides?.[ch.index];
                    const checked = ov?.enabled !== undefined
                      ? ov.enabled
                      : config.selectedChannels === undefined || config.selectedChannels.includes(ch.index);
                    const unitFace = ov?.yUnit !== undefined
                      ? (ov.yUnit === '' ? '—' : ov.yUnit)
                      : (ch.yUnit ?? '—');
                    const multKey = `m:${ch.index}`;
                    const offKey = `o:${ch.index}`;
                    const multVal = chDrafts[multKey] ?? formatCompactNum(ov?.yMult ?? 1);
                    const offVal = chDrafts[offKey] ?? formatCompactNum(ov?.yOffset ?? 0);
                    return (
                      <div key={ch.index} className="iw-chan-row" data-testid={`binary-ch-row-${ch.index}`}>
                        <label className="iw-check t-label iw-chan-name" title={`Include or omit ${ch.label}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            aria-label={`Enable ${ch.label}`}
                            onChange={event => updateChannelOverride(ch.index, { enabled: event.target.checked })}
                          />
                          <span className="iw-chan-label">{ch.label}</span>
                        </label>
                        <Btn
                          variant="slate"
                          small
                          aria-label={`${ch.label} unit`}
                          title={`Override the vertical unit for ${ch.label} only (e.g. A for a current probe)`}
                          aria-haspopup="menu"
                          onClick={event => {
                            const target = event.currentTarget;
                            setChUnitPopover(cur => (cur?.index === ch.index ? null : { index: ch.index, anchor: target }));
                          }}
                        >
                          {unitFace}
                        </Btn>
                        <input
                          className="iw-input iw-input--ch t-label"
                          type="text"
                          inputMode="decimal"
                          aria-label={`${ch.label} scale multiplier`}
                          title={`Multiply ${ch.label} values (e.g. 10 for a 10× probe)`}
                          value={multVal}
                          onChange={event => {
                            const raw = event.target.value;
                            setChDrafts(prev => ({ ...prev, [multKey]: raw }));
                            const n = Number(raw.trim());
                            if (Number.isFinite(n) && n !== 0) updateChannelOverride(ch.index, { yMult: n });
                          }}
                          onBlur={() => setChDrafts(prev => {
                            const next = { ...prev };
                            delete next[multKey];
                            return next;
                          })}
                        />
                        <input
                          className="iw-input iw-input--ch t-label"
                          type="text"
                          inputMode="decimal"
                          aria-label={`${ch.label} Y offset`}
                          title={`Add a constant offset to ${ch.label}`}
                          value={offVal}
                          onChange={event => {
                            const raw = event.target.value;
                            setChDrafts(prev => ({ ...prev, [offKey]: raw }));
                            const n = Number(raw.trim());
                            if (Number.isFinite(n)) updateChannelOverride(ch.index, { yOffset: n });
                          }}
                          onBlur={() => setChDrafts(prev => {
                            const next = { ...prev };
                            delete next[offKey];
                            return next;
                          })}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {config.mode === 'raw' && (
              <section className="iw-group" aria-label="Binary format">
                <h3 className="t-section">Sample encoding</h3>
                <div className="iw-line">
                  <span className="t-label t-muted" title="One-click shortcuts for common SDR / GNU Radio IQ files">Presets</span>
                  <div className="iw-presets" aria-label="SDR presets">
                    {BINARY_RAW_PRESETS.map(preset => {
                      const active = isPresetActive(preset.patch);
                      return (
                        <Btn
                          key={preset.id}
                          small
                          variant="slate"
                          active={active}
                          aria-pressed={active}
                          title={preset.title}
                          onClick={() => applyRawPreset(preset.patch)}
                        >
                          {preset.label}
                        </Btn>
                      );
                    })}
                  </div>
                </div>
                <div className="iw-line">
                  <span className="t-label t-muted" title="Numeric encoding of each sample in the binary stream">Type</span>
                  <div className="iw-seg">
                    <div className="ui-segmented" role="radiogroup" aria-label="Sample data type">
                      {SAMPLE_TYPES.map(opt => {
                        const active = config.sampleType === opt.value;
                        return (
                          <Btn
                            key={opt.value}
                            role="radio"
                            variant="slate"
                            active={active}
                            aria-checked={active}
                            aria-label={opt.ariaLabel}
                            title={opt.title}
                            onClick={() => setConfig(prev => ({ ...prev, sampleType: opt.value }))}
                          >
                            {opt.label}
                          </Btn>
                        );
                      })}
                      <Btn
                        variant="slate"
                        active={extraTypeActive || Boolean(typeMoreAnchor)}
                        aria-label="More data types"
                        title="Additional binary sample formats: 64-bit float (f64), 32-bit int (i32/u32), unsigned 16-bit (u16)"
                        aria-haspopup="menu"
                        aria-expanded={Boolean(typeMoreAnchor)}
                        onClick={event => {
                          const target = event.currentTarget;
                          setTypeMoreAnchor(cur => (cur ? null : target));
                        }}
                      >
                        <span className="iw-more-face">{extraTypeFace}<CaretDownIcon /></span>
                      </Btn>
                    </div>
                  </div>
                </div>
                <div className="iw-line">
                  <span className="t-label t-muted" title="Multi-byte integer/float byte order">Byte order</span>
                  <div className="iw-seg">
                    <Segmented
                      label="Byte order"
                      options={ENDIANS}
                      value={config.endian}
                      onChange={endian => setConfig(prev => ({ ...prev, endian }))}
                    />
                  </div>
                </div>
                <div className="iw-line">
                  <span className="t-label t-muted" title="How channels are arranged inside the binary stream">Layout</span>
                  <div className="iw-seg">
                    <Segmented
                      label="Channel layout"
                      options={LAYOUTS}
                      value={config.layout}
                      onChange={layout => setConfig(prev => ({ ...prev, layout }))}
                    />
                  </div>
                </div>
                {config.layout === 'iq' && (
                  <label className="iw-check t-label" title="Swap I and Q sample order if the file stores [Q0, I0, Q1, I1, …]">
                    <input
                      type="checkbox"
                      checked={Boolean(config.swapIQ)}
                      onChange={event => setConfig(prev => ({ ...prev, swapIQ: event.target.checked }))}
                    />
                    Swap I / Q order
                  </label>
                )}
                {(config.layout === 'interleaved' || config.layout === 'planar') && (
                  <div className="iw-line">
                    <label className="t-label t-muted" htmlFor={chCountId} title="Number of channels packed in the binary stream (2–8)">Channels</label>
                    <input
                      id={chCountId}
                      className="iw-input t-label"
                      type="number"
                      min={2}
                      max={8}
                      step={1}
                      title="Number of channels in the binary file (2–8)"
                      value={config.channelCount}
                      onChange={event => {
                        const n = Math.max(2, Math.min(8, Math.floor(Number(event.target.value) || 2)));
                        setConfig(prev => ({ ...prev, channelCount: n }));
                      }}
                    />
                  </div>
                )}
                <div className="iw-line">
                  <span className="t-label t-muted" title="Physical quantity of the X axis (Time waveform, Spectrum Analyzer frequency sweep, or plain sample index)">X axis</span>
                  <div className="iw-seg">
                    <Segmented
                      label="Binary X axis domain"
                      options={X_DOMAINS}
                      value={activeXDomain}
                      onChange={xDomain => {
                        setConfig(prev => ({
                          ...prev,
                          xDomain,
                          ...(xDomain === 'time' && prev.sampleRateHz <= 0 ? { sampleRateHz: 1_000_000 } : {}),
                          ...(xDomain === 'frequency' && prev.freqStartHz === undefined && prev.freqStopHz === undefined
                            ? { freqStartHz: 0, freqStopHz: 1_000_000_000 }
                            : {}),
                        }));
                        if (xDomain === 'time' && config.sampleRateHz <= 0) setRateDraft('1000000');
                      }}
                    />
                  </div>
                </div>
                {activeXDomain === 'frequency' && (
                  <div className="iw-pair-grid">
                    <div className="iw-field">
                      <label className="t-caption" htmlFor={freqStartId} title="Spectrum sweep start frequency in Hz (supports k, M, G suffixes, e.g. 100M)">Start freq (Hz)</label>
                      <input
                        id={freqStartId}
                        className="iw-input t-label"
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 100M"
                        title="Start frequency of the binary spectrum sweep (e.g. 0, 100M, 2.4G)"
                        value={freqStartDraft}
                        onChange={event => {
                          const raw = event.target.value;
                          setFreqStartDraft(raw);
                          const parsed = parseEngInput(raw, { baseUnit: 'Hz' });
                          if (parsed.ok && Number.isFinite(parsed.value)) {
                            setConfig(prev => ({ ...prev, xDomain: 'frequency', freqStartHz: parsed.value }));
                          }
                        }}
                        onBlur={() => setFreqStartDraft(formatCompactNum(config.freqStartHz ?? 0))}
                      />
                    </div>
                    <div className="iw-field">
                      <label className="t-caption" htmlFor={freqStopId} title="Spectrum sweep stop frequency in Hz (supports k, M, G suffixes, e.g. 2.4G)">Stop freq (Hz)</label>
                      <input
                        id={freqStopId}
                        className="iw-input t-label"
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 2.4G"
                        title="Stop frequency of the binary spectrum sweep (must be greater than Start freq)"
                        value={freqStopDraft}
                        onChange={event => {
                          const raw = event.target.value;
                          setFreqStopDraft(raw);
                          const parsed = parseEngInput(raw, { baseUnit: 'Hz' });
                          if (parsed.ok && Number.isFinite(parsed.value)) {
                            setConfig(prev => ({ ...prev, xDomain: 'frequency', freqStopHz: parsed.value }));
                          }
                        }}
                        onBlur={() => setFreqStopDraft(formatCompactNum(config.freqStopHz ?? 1e9))}
                      />
                    </div>
                  </div>
                )}
                <div className="iw-pair-grid">
                  {activeXDomain === 'time' && (
                    <div className="iw-field">
                      <label className="t-caption" htmlFor={rateId} title="Sample rate in Hz for the time axis (supports k, M, G suffixes; 0 switches to sample index)">Rate (Hz)</label>
                      <input
                        id={rateId}
                        className="iw-input t-label"
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 1M or 0"
                        title="Sample rate in Hz (e.g. 100k, 2.4M, 1G; enter 0 to plot against sample index)"
                        value={rateDraft}
                        onChange={event => {
                          const raw = event.target.value;
                          setRateDraft(raw);
                          const parsed = parseEngInput(raw, { baseUnit: 'Hz' });
                          if (parsed.ok && parsed.value >= 0) {
                            setConfig(prev => ({
                              ...prev,
                              xDomain: parsed.value > 0 ? 'time' : 'index',
                              sampleRateHz: parsed.value,
                            }));
                          }
                        }}
                        onBlur={() => setRateDraft(String(config.sampleRateHz))}
                      />
                    </div>
                  )}
                  <div className="iw-field">
                    <label className="t-caption" htmlFor={skipId} title="Leading header bytes to ignore before the first sample">Skip bytes</label>
                    <div className="iw-inline-row">
                      <input
                        id={skipId}
                        className="iw-input t-label"
                        type="number"
                        min={0}
                        max={Math.max(0, buffer.byteLength - 2)}
                        step={1}
                        title="Number of leading header bytes to skip before reading samples"
                        value={config.headerBytes}
                        onChange={event => {
                          const n = Math.max(0, Math.floor(Number(event.target.value) || 0));
                          setHexPageOffset(null);
                          setAutoSkipHint(null);
                          setConfig(prev => ({ ...prev, headerBytes: n }));
                        }}
                      />
                      <Btn
                        small
                        aria-label="Auto-skip header"
                        title="Scan for WAV, NumPy .npy, oscilloscope headers, IEEE #block, or leading ASCII preamble and jump Skip bytes past it"
                        onClick={autoSkipHeader}
                      >
                        Auto
                      </Btn>
                    </div>
                  </div>
                </div>
                {autoSkipHint && (
                  <div className="t-caption t-muted" role="status" data-testid="binary-wizard-autoskip-hint">
                    {autoSkipHint}
                  </div>
                )}
                <details className="iw-disclosure" open={Boolean((config.framePadBytes ?? 0) > 0 || (config.footerBytes ?? 0) > 0)}>
                  <summary className="t-caption" title="Optional per-frame struct padding and trailing EOF footer bytes">
                    Struct framing &amp; footer
                  </summary>
                  <div className="iw-disclosure-body iw-pair-grid">
                    {config.layout !== 'planar' && (
                      <div className="iw-field">
                        <label className="t-caption" htmlFor={padId} title="Extra trailing bytes skipped after each sample frame (e.g. timestamps, flags, or CRC)">Frame pad (B)</label>
                        <input
                          id={padId}
                          className="iw-input t-label"
                          type="number"
                          min={0}
                          max={1024}
                          step={1}
                          title="Extra padding bytes to skip after each sample frame (0 = tightly packed)"
                          value={config.framePadBytes ?? 0}
                          onChange={event => {
                            const n = Math.max(0, Math.floor(Number(event.target.value) || 0));
                            setConfig(prev => ({ ...prev, framePadBytes: n }));
                          }}
                        />
                      </div>
                    )}
                    <div className="iw-field">
                      <label className="t-caption" htmlFor={footerId} title="Trailing bytes to ignore at the end of the file (e.g. EOF metadata or checksums)">Footer (B)</label>
                      <input
                        id={footerId}
                        className="iw-input t-label"
                        type="number"
                        min={0}
                        max={Math.max(0, buffer.byteLength - 2)}
                        step={1}
                        title="Number of trailing footer bytes to ignore at end-of-file (0 = read to end)"
                        value={config.footerBytes ?? 0}
                        onChange={event => {
                          const n = Math.max(0, Math.floor(Number(event.target.value) || 0));
                          setConfig(prev => ({ ...prev, footerBytes: n }));
                        }}
                      />
                    </div>
                  </div>
                </details>
              </section>
            )}

            <section className="iw-group" aria-label="Sample window">
              <h3 className="t-section">Sample slice</h3>
              <div className="iw-pair-grid">
                <div className="iw-field">
                  <label className="t-caption" htmlFor={startId} title="0-based sample index to start importing from">Start</label>
                  <input
                    id={startId}
                    className="iw-input t-label"
                    type="number"
                    min={0}
                    step={1}
                    title="First sample index to read per channel (0 = start of waveform)"
                    value={config.startSample}
                    onChange={event => setConfig(prev => ({ ...prev, startSample: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))}
                  />
                </div>
                <div className="iw-field">
                  <label className="t-caption" htmlFor={countId} title="Maximum number of samples per channel to import (0 = all available)">Samples</label>
                  <input
                    id={countId}
                    className="iw-input t-label"
                    type="number"
                    min={0}
                    step={1}
                    title="Maximum samples per channel to load (0 = import every sample from Start to end)"
                    value={config.sampleCount}
                    onChange={event => setConfig(prev => ({ ...prev, sampleCount: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))}
                  />
                </div>
              </div>
              <span className="t-caption">0 = all ({formatCount(preview.totalAvailableSamples)} available)</span>
            </section>

            <section className="iw-group" aria-label="Scaling and units">
              <h3 className="t-section">{config.mode === 'auto-scope' ? 'Global scaling & X axis' : 'Units & scaling'}</h3>
              <div className="iw-seg">
                <div className="ui-segmented" role="radiogroup" aria-label="Y unit override">
                  {Y_QUICK.map(opt => {
                    const active = yQuickValue === opt.value;
                    return (
                      <Btn
                        key={opt.value}
                        role="radio"
                        variant="slate"
                        active={active}
                        aria-checked={active}
                        aria-label={opt.ariaLabel}
                        title={opt.title}
                        onClick={() => setConfig(prev => ({ ...prev, yUnit: opt.value === '__auto' ? undefined : opt.value }))}
                      >
                        {opt.label}
                      </Btn>
                    );
                  })}
                  <Btn
                    variant="slate"
                    active={yQuickValue === null || Boolean(yMoreAnchor)}
                    aria-label="More Y unit overrides"
                    title="More vertical axis unit overrides (dB, mA, W, No unit)"
                    aria-haspopup="menu"
                    aria-expanded={Boolean(yMoreAnchor)}
                    onClick={event => {
                      const target = event.currentTarget;
                      setYMoreAnchor(cur => (cur ? null : target));
                    }}
                  >
                    <span className="iw-more-face">{yExtraFace}<CaretDownIcon /></span>
                  </Btn>
                </div>
              </div>
              <div className="iw-pair-grid">
                <div className="iw-field">
                  <label className="t-caption" htmlFor={multId} title="Multiply all vertical values by this factor (e.g. 10 for a 10× probe or -1 to invert)">Y scale ×</label>
                  <input
                    id={multId}
                    className="iw-input t-label"
                    type="text"
                    inputMode="decimal"
                    title="Global vertical multiplier (applied before Y offset)"
                    value={yMultDraft}
                    onChange={event => {
                      const raw = event.target.value;
                      setYMultDraft(raw);
                      const n = Number(raw.trim());
                      if (Number.isFinite(n) && n !== 0) setConfig(prev => ({ ...prev, yMult: n }));
                    }}
                    onBlur={() => setYMultDraft(formatCompactNum(config.yMult))}
                  />
                </div>
                <div className="iw-field">
                  <label className="t-caption" htmlFor={offId} title="Add a constant DC offset to every sample after Y scale">Y offset</label>
                  <input
                    id={offId}
                    className="iw-input t-label"
                    type="text"
                    inputMode="decimal"
                    title="Constant vertical offset added after Y scale"
                    value={yOffsetDraft}
                    onChange={event => {
                      const raw = event.target.value;
                      setYOffsetDraft(raw);
                      const n = Number(raw.trim());
                      if (Number.isFinite(n)) setConfig(prev => ({ ...prev, yOffset: n }));
                    }}
                    onBlur={() => setYOffsetDraft(formatCompactNum(config.yOffset))}
                  />
                </div>
                <div className="iw-field">
                  <label className="t-caption" htmlFor={xMultId} title="Multiply X axis (time/frequency) coordinates by this factor (fixes wrong scope timebase)">X scale ×</label>
                  <input
                    id={xMultId}
                    className="iw-input t-label"
                    type="text"
                    inputMode="decimal"
                    title="Horizontal scale multiplier (e.g. 0.5 or 2 if timebase is off)"
                    value={xMultDraft}
                    onChange={event => {
                      const raw = event.target.value;
                      setXMultDraft(raw);
                      const n = Number(raw.trim());
                      if (Number.isFinite(n) && n !== 0) setConfig(prev => ({ ...prev, xMult: n }));
                    }}
                    onBlur={() => setXMultDraft(formatCompactNum(config.xMult))}
                  />
                </div>
                <div className="iw-field">
                  <label className="t-caption" htmlFor={xOffId} title="Shift the horizontal origin t₀ (e.g. -50u to centre a trigger)">X offset (t₀)</label>
                  <input
                    id={xOffId}
                    className="iw-input t-label"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. -50u or 0"
                    title="Horizontal trigger/origin shift (supports suffixes like n, u, m)"
                    value={xOffsetDraft}
                    onChange={event => {
                      const raw = event.target.value;
                      setXOffsetDraft(raw);
                      const parsed = parseEngInput(raw, { baseUnit: 's' });
                      if (parsed.ok) {
                        setConfig(prev => ({ ...prev, xOffset: parsed.value }));
                      } else {
                        const n = Number(raw.trim());
                        if (Number.isFinite(n)) setConfig(prev => ({ ...prev, xOffset: n }));
                      }
                    }}
                    onBlur={() => setXOffsetDraft(formatCompactNum(config.xOffset ?? 0))}
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="iw-main">
            {entry.binaryWarning && (
              <MessageBar status="warning">Auto-parse notice: {entry.binaryWarning} You can switch parser or adjust raw binary settings on the left.</MessageBar>
            )}
            <div className="iw-preview-head">
              <h3 className="t-section">Waveform preview</h3>
              <span className="t-caption">{formatCount(buffer.byteLength)} bytes</span>
            </div>
            <WizardPreviewPlot plot={preview.plot} colors={yColors} />
            {preview.rangeText && (
              <div className="iw-plot-range t-readout" data-testid="binary-wizard-range">{preview.rangeText}</div>
            )}
            {preview.encodingWarning && (
              <div data-testid="binary-wizard-encoding-warning">
                <MessageBar status="warning">{preview.encodingWarning.message}</MessageBar>
              </div>
            )}
            {config.mode === 'auto-scope' && preview.headerSummary && (
              <div className="iw-header-summary t-caption" data-testid="binary-wizard-header-summary">
                {preview.headerSummary}
              </div>
            )}
            <BinaryPointBudgetBanner
              pointStats={pointStats}
              reductionGroupName={reductionGroupName}
              activeReductionMode={activeReductionMode}
              decimateDraft={decimateDraft}
              displayDecimateFactor={displayDecimateFactor}
              recommendedFactor={recommendedFactor}
              deviceMemoryGb={deviceMemoryGb}
              sampleRateHz={preview.sampleRateHz}
              mode={config.mode}
              hasScopeSignature={effectiveScope !== null}
              rangeText={preview.rangeText}
              currentReduction={config.reduction}
              onSelectFull={() => {
                setUserPickedReduction(true);
                setConfig(prev => ({ ...prev, reduction: { mode: 'full' } }));
              }}
              onSelectDecimate={selectDecimateReduction}
              onDecimateDraftChange={raw => {
                setDecimateDraft(raw);
                setUserPickedReduction(true);
                const trimmed = raw.trim();
                const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
                if (Number.isSafeInteger(parsed) && parsed >= 2) {
                  setConfig(prev => ({ ...prev, reduction: { mode: 'decimate', factor: parsed } }));
                } else {
                  setConfig(prev => (
                    prev.reduction?.mode === 'decimate'
                      ? prev
                      : { ...prev, reduction: { mode: 'decimate', factor: recommendedFactor } }
                  ));
                }
              }}
              onDecimateBlur={() => {
                const trimmed = decimateDraft.trim();
                const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
                if (Number.isSafeInteger(parsed) && parsed >= 2) {
                  setDecimateDraft(String(parsed));
                  setConfig(prev => ({ ...prev, reduction: { mode: 'decimate', factor: parsed } }));
                } else {
                  const fallback = config.reduction?.mode === 'decimate' && config.reduction.factor >= 2
                    ? Math.floor(config.reduction.factor)
                    : recommendedFactor;
                  setDecimateDraft(String(fallback));
                  setConfig(prev => ({ ...prev, reduction: { mode: 'decimate', factor: fallback } }));
                }
              }}
              onSelectEnvelope={() => {
                setUserPickedReduction(true);
                setConfig(prev => ({
                  ...prev,
                  reduction: { mode: 'envelope', targetPoints: DEFAULT_ENVELOPE_TARGET },
                }));
              }}
            />
            <BinaryHexInspector
              buffer={buffer}
              mode={config.mode}
              endian={config.endian}
              headerBytes={config.headerBytes}
              hexOffset={preview.hexOffset}
              hexSize={hexSize}
              selectedHexByte={selectedHexByte}
              onHexSizeChange={setHexSize}
              onPageOffsetChange={setHexPageOffset}
              onSelectHexByte={setSelectedHexByte}
              onNudgeSkip={nudgeSkip}
              onApplySkipOffset={target => {
                setSelectedHexByte(null);
                setHexPageOffset(null);
                setAutoSkipHint(null);
                setConfig(prev => ({ ...prev, headerBytes: target }));
              }}
            />
            {!blocker && (
              <p className="iw-result t-caption" data-testid="import-wizard-summary">
                Will {editing ? 'show' : 'create'} {preview.channels.length} trace{preview.channels.length === 1 ? '' : 's'}:{' '}
                <span className="t-card-title">{entry.fileName}</span>
                {preview.channels.map(ch => <span key={ch.index}> · {ch.label}{ch.yUnit ? ` (${ch.yUnit})` : ''}</span>)}
              </p>
            )}
            {editing && <MessageBar status="info">Traces whose channel still exists keep their colour, markers and pane.</MessageBar>}
          </div>
        </div>

        <footer className="iw-foot">
          <input
            ref={settingsFileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={event => {
              const picked = event.target.files?.[0];
              if (picked) void importBinarySettings(picked);
              event.target.value = '';
            }}
          />
          {!editing && others.length > 0 && (
            <label className="iw-check t-label" title="Apply these exact binary import settings to every remaining binary file in this batch">
              <input type="checkbox" checked={applyToOthers} onChange={event => setApplyToOthers(event.target.checked)} />
              Use these settings for the other {others.length === 1 ? 'file' : `${others.length} files`}
            </label>
          )}
          <Btn
            small
            title="Export current binary import settings as a reusable .json profile"
            onClick={exportBinarySettings}
          >
            Save settings
          </Btn>
          <Btn
            small
            title="Load a previously saved .json binary import profile"
            onClick={() => settingsFileInputRef.current?.click()}
          >
            Load settings
          </Btn>
          {settingsNotice && <span className="t-caption" data-testid="binary-wizard-settings-notice">{settingsNotice}</span>}
          <span className="iw-spacer" />
          {blocker && <span className="iw-blocker t-caption" data-testid="import-wizard-blocker">{blocker}</span>}
          {!editing && total > 1 && <Btn onClick={skipFile} title="Skip this file and continue with the next file in the batch">Skip file</Btn>}
          <Btn onClick={cancel} title="Close without importing (Esc)">Cancel</Btn>
          <Btn variant="solid" onClick={() => void confirm()} disabled={!!blocker} title="Import traces with these settings (Enter)" data-testid="import-wizard-confirm">{mainLabel}</Btn>
        </footer>

        {parserMoreAnchor && (
          <PopoverAt
            label="Choose parser format"
            at={parserMoreAnchor}
            onClose={() => setParserMoreAnchor(null)}
            onEscape={() => { const at = parserMoreAnchor; setParserMoreAnchor(null); at.focus(); }}
          >
            <div className="iw-role-menu t-label" role="menu" aria-label="Choose parser format">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={config.mode === 'auto-scope' && activeParserChoice === 'auto'}
                aria-disabled={!detectedScope}
                onClick={() => {
                  if (!detectedScope) return;
                  setConfig(prev => ({ ...prev, mode: 'auto-scope', parserOverride: 'auto' }));
                  setParserMoreAnchor(null);
                }}
              >
                Auto-detect ({scopeFormatLabel(detectedScope)})
              </button>
              {EXPLICIT_PARSERS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={config.mode === 'auto-scope' && activeParserChoice === opt.value}
                  title={opt.title}
                  onClick={() => {
                    setConfig(prev => ({ ...prev, mode: 'auto-scope', parserOverride: opt.value }));
                    setParserMoreAnchor(null);
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={config.mode === 'raw'}
                title="Decode raw binary samples directly using custom type, endianness, layout, and skip bytes"
                onClick={() => {
                  setConfig(prev => ({ ...prev, mode: 'raw' }));
                  setParserMoreAnchor(null);
                }}
              >
                Raw binary / IQ
              </button>
              <div className="iw-menu-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                title="Re-interpret this file as UTF-8 text in the Tabular / CSV import wizard"
                onClick={switchToText}
              >
                Open as Text / CSV…
              </button>
            </div>
          </PopoverAt>
        )}

        {typeMoreAnchor && (
          <PopoverAt
            label="More data types"
            at={typeMoreAnchor}
            onClose={() => setTypeMoreAnchor(null)}
            onEscape={() => { const at = typeMoreAnchor; setTypeMoreAnchor(null); at.focus(); }}
          >
            <div className="iw-unit-pop" role="menu" aria-label="More data types">
              <div className="iw-unit-grid">
                {EXTRA_SAMPLE_TYPES.map(opt => (
                  <Btn
                    key={opt.value}
                    role="menuitemradio"
                    variant="slate"
                    small
                    active={config.sampleType === opt.value}
                    aria-checked={config.sampleType === opt.value}
                    aria-label={opt.ariaLabel}
                    title={opt.title}
                    onClick={() => { setConfig(prev => ({ ...prev, sampleType: opt.value })); setTypeMoreAnchor(null); }}
                  >
                    {opt.label}
                  </Btn>
                ))}
              </div>
            </div>
          </PopoverAt>
        )}

        {yMoreAnchor && (
          <PopoverAt
            label="More Y unit overrides"
            at={yMoreAnchor}
            onClose={() => setYMoreAnchor(null)}
            onEscape={() => { const at = yMoreAnchor; setYMoreAnchor(null); at.focus(); }}
          >
            <div className="iw-unit-pop" role="menu" aria-label="More Y unit overrides">
              <div className="iw-unit-grid">
                {Y_EXTRA.map(opt => (
                  <Btn
                    key={opt.value || '__none'}
                    role="menuitemradio"
                    variant="slate"
                    small
                    active={config.yUnit === opt.value}
                    aria-checked={config.yUnit === opt.value}
                    title={opt.title}
                    onClick={() => { setConfig(prev => ({ ...prev, yUnit: opt.value })); setYMoreAnchor(null); }}
                  >
                    {opt.label}
                  </Btn>
                ))}
              </div>
            </div>
          </PopoverAt>
        )}

        {chUnitPopover && (
          <PopoverAt
            label="Channel unit"
            at={chUnitPopover.anchor}
            onClose={() => setChUnitPopover(null)}
            onEscape={() => { const at = chUnitPopover.anchor; setChUnitPopover(null); at.focus(); }}
          >
            <div className="iw-unit-pop" role="menu" aria-label="Channel unit">
              <div className="iw-unit-grid">
                {CHANNEL_UNITS.map(opt => {
                  const cur = config.channelOverrides?.[chUnitPopover.index]?.yUnit;
                  const active = cur === opt.value;
                  return (
                    <Btn
                      key={opt.label}
                      role="menuitemradio"
                      variant="slate"
                      small
                      active={active}
                      aria-checked={active}
                      onClick={() => {
                        updateChannelOverride(chUnitPopover.index, { yUnit: opt.value });
                        setChUnitPopover(null);
                      }}
                    >
                      {opt.label}
                    </Btn>
                  );
                })}
              </div>
            </div>
          </PopoverAt>
        )}
      </div>
    </div>
  );
}
