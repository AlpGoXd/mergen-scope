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
  previewBinaryImport,
  rawTotalSamples,
  scopeFormatLabel,
} from '../../domain/parsers/raw-binary';
import type {
  BinaryChannelLayout,
  BinaryChannelOverride,
  BinaryEndian,
  BinaryImportConfig,
  BinaryParserChoice,
  BinaryPreviewChannel,
  BinarySampleType,
} from '../../domain/parsers/raw-binary';
import { defaultBinaryReduction } from '../../domain/parsers/binary-reduce';
import { formatBytes, pointBudget, recommendedDecimateFactor } from '../../domain/point-budget';
import type { PointBudget, PointBudgetLevel } from '../../domain/point-budget';
import { formatEngineeringValue } from '../../domain/format';
import { formatCount } from '../../domain/import-wizard';
import { parseEngInput } from '../../domain/units';
import { useWizardTraceColors } from '../../hooks/use-wizard-trace-colors';
import { Btn } from '../shared/Btn';
import { Icon, MessageBar, PopoverAt, Segmented } from '../shared/Controls';
import { CaretDownIcon } from '../shared/Icons';
import { CONFIDENCE_ICON, CONFIDENCE_LABEL } from './WizardSettings';
import { WizardPreviewPlot } from './WizardPreviewPlot';

const SAMPLE_TYPES: readonly { value: BinarySampleType; label: string; ariaLabel: string }[] = [
  { value: 'float32', label: 'f32', ariaLabel: 'Float 32-bit' },
  { value: 'int16', label: 'i16', ariaLabel: 'Signed 16-bit integer' },
  { value: 'int8', label: 'i8', ariaLabel: 'Signed 8-bit integer' },
  { value: 'uint8', label: 'u8', ariaLabel: 'Unsigned 8-bit integer' },
];

const EXTRA_SAMPLE_TYPES: readonly { value: BinarySampleType; label: string; ariaLabel: string }[] = [
  { value: 'float64', label: 'f64', ariaLabel: 'Float 64-bit' },
  { value: 'int32', label: 'i32', ariaLabel: 'Signed 32-bit integer' },
  { value: 'uint32', label: 'u32', ariaLabel: 'Unsigned 32-bit integer' },
  { value: 'uint16', label: 'u16', ariaLabel: 'Unsigned 16-bit integer' },
];

const ENDIANS: readonly { value: BinaryEndian; label: string; ariaLabel: string }[] = [
  { value: 'le', label: 'LE', ariaLabel: 'Little-endian' },
  { value: 'be', label: 'BE', ariaLabel: 'Big-endian' },
];

const LAYOUTS: readonly { value: BinaryChannelLayout; label: string; ariaLabel: string }[] = [
  { value: 'real', label: 'Real', ariaLabel: 'Single real channel' },
  { value: 'iq', label: 'IQ', ariaLabel: 'Complex IQ (I and Q)' },
  { value: 'interleaved', label: 'Interl.', ariaLabel: 'Interleaved multi-channel' },
  { value: 'planar', label: 'Planar', ariaLabel: 'Sequential (planar) multi-channel' },
];

const Y_QUICK: readonly { value: string; label: string; ariaLabel: string }[] = [
  { value: '__auto', label: 'Auto', ariaLabel: 'Default unit' },
  { value: 'V', label: 'V', ariaLabel: 'volts (V)' },
  { value: 'mV', label: 'mV', ariaLabel: 'millivolts (mV)' },
  { value: 'A', label: 'A', ariaLabel: 'amperes (A)' },
  { value: 'dBm', label: 'dBm', ariaLabel: 'dB milliwatt (dBm)' },
];

const Y_EXTRA: readonly { value: string; label: string }[] = [
  { value: 'dB', label: 'dB' },
  { value: 'mA', label: 'mA' },
  { value: 'W', label: 'W' },
  { value: '', label: 'No unit' },
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

const EXPLICIT_PARSERS: readonly { value: BinaryFormat; label: string }[] = [
  { value: 'wavebin', label: 'Keysight / Rigol (.bin)' },
  { value: 'lecroy-trc', label: 'LeCroy (.trc)' },
  { value: 'tek-isf', label: 'Tektronix (.isf)' },
  { value: 'owon-bin', label: 'OWON (.bin)' },
];

const SKIP_NUDGES: readonly { delta: number; label: string }[] = [
  { delta: -1, label: '−1' },
  { delta: 1, label: '+1' },
  { delta: 4, label: '+4' },
  { delta: 16, label: '+16' },
];

function enterIsTaken(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('.ui-popover')) return true;
  return target instanceof HTMLButtonElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

const DEFAULT_ENVELOPE_TARGET = 16_000;

interface BinaryPointBudgetStats {
  readonly channelCount: number;
  readonly perChannelSamples: number | null;
  readonly totalPoints: number;
  readonly budget: PointBudget;
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

function formatCompactPoints(points: number): string {
  if (!Number.isFinite(points) || points <= 0) return '0';
  if (points >= 1_000_000) return `${Number((points / 1_000_000).toFixed(2))} M`;
  if (points >= 1_000) return `${Number((points / 1_000).toFixed(2))} k`;
  return String(Math.round(points));
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

function formatBudgetSummaryLine(stats: BinaryPointBudgetStats): string {
  const memText = formatBytes(stats.budget.estimatedBytes);
  const channelWord = stats.channelCount === 1 ? 'channel' : 'channels';
  if (stats.perChannelSamples !== null) {
    return `${stats.channelCount} ${channelWord} \u00d7 ${formatCompactPoints(stats.perChannelSamples)} = ${formatCompactPoints(stats.totalPoints)} points. Keep all needs about ${memText} of memory.`;
  }
  return `${stats.channelCount} ${channelWord} \u00b7 ${formatCompactPoints(stats.totalPoints)} points total. Keep all needs about ${memText} of memory.`;
}

function keepAllWarningSubtext(level: PointBudgetLevel, estimatedBytes: number, deviceMemoryGb?: number): string {
  if (level === 'large') {
    return 'The app may be slower to zoom and analyse.';
  }
  if (level === 'very-large') {
    const base = `Not recommended. Needs about ${formatBytes(estimatedBytes)} free.`;
    return deviceMemoryGb !== undefined ? `${base} Your device reports ${deviceMemoryGb} GB.` : base;
  }
  return `Not recommended. About ${formatBytes(estimatedBytes)} is more than a browser tab can usually hold (about 4 GB, regardless of how much RAM your PC has). The tab will probably crash.`;
}

function isSampleIndexAxis(
  mode: BinaryImportConfig['mode'],
  hasScopeSignature: boolean,
  rangeText: string | null,
): boolean {
  if (mode === 'raw' || !hasScopeSignature) return true;
  if (!rangeText) return false;
  const xPart = rangeText.split(' \u00b7 Y:')[0]?.trim() ?? '';
  return /^X:\s*[-+\d.eE]+\s*\u2192\s*[-+\d.eE]+$/.test(xPart);
}

function decimatedRateInfo(
  sampleRateHz: number | null,
  factor: number,
  totalPoints: number,
  isSampleIndexX: boolean,
): string {
  const safeFactor = Math.max(2, Math.floor(factor));
  const resultingPoints = Math.ceil(totalPoints / safeFactor);
  const ptsText = `${formatCompactPoints(resultingPoints)} points`;
  if (sampleRateHz !== null && Number.isFinite(sampleRateHz) && sampleRateHz > 0) {
    const newRateHz = sampleRateHz / safeFactor;
    const nyquistHz = newRateHz / 2;
    return `New sample rate: ${formatEngineeringValue(newRateHz, 'Hz', 3)} \u00b7 Nyquist: ${formatEngineeringValue(nyquistHz, 'Hz', 3)} \u00b7 ${ptsText}`;
  }
  const ratePrefix = isSampleIndexX
    ? 'Sample rate not set (X is sample index)'
    : 'Sample rate unavailable';
  return `${ratePrefix} \u00b7 ${ptsText}`;
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
  queue: readonly WizardEntry[];
  priorFile: RawFileRecord | undefined;
}

export function BinaryWizardDialog({ entry, buffer, position, total, queue, priorFile }: BinaryWizardDialogProps) {
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
  const preview = useMemo(() => previewBinaryImport(buffer, entry.fileName, config), [buffer, entry.fileName, config]);
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
  const [yMultDraft, setYMultDraft] = useState(() => formatCompactNum(config.yMult));
  const [yOffsetDraft, setYOffsetDraft] = useState(() => formatCompactNum(config.yOffset));
  const [xMultDraft, setXMultDraft] = useState(() => formatCompactNum(config.xMult));
  const [xOffsetDraft, setXOffsetDraft] = useState(() => formatCompactNum(config.xOffset ?? 0));
  const [chDrafts, setChDrafts] = useState<Record<string, string>>({});

  const skipId = useId();
  const rateId = useId();
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

  const resolveDecisions = async (batchId: string) => {
    const batch = entry.pendingBatch;
    const decisions: Record<string, { choice: OpenChoice; expectedFileId?: string }> = {};
    let workspaceChoice: 'replace' | undefined;
    if (!batch || batch.id !== batchId || !aggregate) return { ok: true as const, decisions, workspaceChoice };
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
    let extra: { decisions: Record<string, { choice: OpenChoice; expectedFileId?: string }>; workspaceChoice?: 'replace' } | undefined;
    const batchId = entry.pendingBatch?.id;
    if (batchId) {
      const left = queue.filter(other => other.pendingBatch?.id === batchId && other.id !== entry.id);
      if (!left.length) {
        asking.current = true;
        const answer = await resolveDecisions(batchId).finally(() => { asking.current = false; });
        if (!answer.ok) return;
        extra = { decisions: answer.decisions, workspaceChoice: answer.workspaceChoice };
      }
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
    fileDispatch({
      type: 'RESOLVE_BINARY_WIZARD',
      payload: {
        id: entry.id,
        binaryConfig: normalizedConfig,
        ...(extra ? { decisions: extra.decisions, workspaceChoice: extra.workspaceChoice } : {}),
      },
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
    setConfig(prev => ({
      ...prev,
      headerBytes: Math.max(0, Math.min(Math.max(0, buffer.byteLength - 2), prev.headerBytes + delta)),
    }));
  };

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

  const hexHeading = preview.hexOffset > 0
    ? `Data bytes at 0x${preview.hexOffset.toString(16).padStart(4, '0')} (skip ${formatCount(preview.hexOffset)} B)`
    : 'Header bytes (first 64 B)';

  const mainLabel = editing ? 'Apply' : `Add ${preview.channels.length} trace${preview.channels.length === 1 ? '' : 's'}`;

  return (
    <div className="ui-dialog-backdrop">
      <div ref={dialogRef} className="ui-dialog iw-dialog" role="dialog" aria-modal="true" aria-labelledby="binary-wizard-title" data-testid="binary-wizard" tabIndex={-1}>
        <header className="iw-head">
          <h2 id="binary-wizard-title" className="iw-title t-title">
            {editing ? 'Binary import settings' : 'Open binary'} <span className="iw-file" title={entry.fileName}>{entry.fileName}</span>
          </h2>
          {total > 1 && <span className="t-caption" data-testid="import-wizard-queue">File {position} of {total}</span>}
          <button type="button" className="iw-close" aria-label="Close" title="Cancel (Esc)" onClick={cancel}><Icon name="close" /></button>
        </header>

        <div className="iw-body">
          <div className="iw-settings">
            <section className="iw-group" aria-label="Parser">
              <h3 className="t-section">Parser</h3>
              <div className="iw-seg">
                <div className="ui-segmented" role="radiogroup" aria-label="Parser mode">
                  <Btn
                    role="radio"
                    variant="slate"
                    active={config.mode === 'auto-scope'}
                    aria-checked={config.mode === 'auto-scope'}
                    disabled={!detectedScope && activeParserChoice === 'auto'}
                    title={detectedScope ? `Scope header (${scopeFormatLabel(detectedScope)})` : 'Select a scope format from Format menu'}
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'auto-scope' }))}
                  >
                    Scope header
                  </Btn>
                  <Btn
                    role="radio"
                    variant="slate"
                    active={config.mode === 'raw'}
                    aria-checked={config.mode === 'raw'}
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'raw' }))}
                  >
                    Raw binary
                  </Btn>
                  <Btn
                    variant="slate"
                    active={explicitParserActive || Boolean(parserMoreAnchor)}
                    aria-label="Choose parser format"
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
                  ? 'Decoding raw samples directly'
                  : activeParserChoice !== 'auto'
                    ? `Forced: ${scopeFormatLabel(activeParserChoice)}`
                    : `Detected: ${scopeFormatLabel(detectedScope)}`}
              </span>
            </section>

            <section className="iw-group" aria-label="Auto-detect confidence">
              <h3 className="t-section">Auto-detect</h3>
              <div
                className={`iw-detect is-${confidence.level}`}
                data-testid="binary-wizard-confidence"
                data-confidence-level={confidence.level}
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

            {config.mode === 'auto-scope' && preview.allScopeChannels.length > 0 && (
              <section className="iw-group" aria-label="Channels">
                <h3 className="t-section">Channels (probe &amp; unit)</h3>
                <div className="iw-chan-table" data-testid="binary-wizard-channels">
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
                        <label className="iw-check t-label iw-chan-name" title={ch.label}>
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
                          title="Channel Y scale multiplier (e.g. 10 for 10× probe)"
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
                          title="Channel Y offset"
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
                  <span className="t-caption">Columns: Channel · Unit · Scale × · Offset</span>
                </div>
              </section>
            )}

            {config.mode === 'raw' && (
              <section className="iw-group" aria-label="Binary format">
                <h3 className="t-section">Binary format</h3>
                <div className="iw-presets" aria-label="SDR presets">
                  {BINARY_RAW_PRESETS.map(preset => (
                    <Btn
                      key={preset.id}
                      small
                      title={preset.title}
                      onClick={() => applyRawPreset(preset.patch)}
                    >
                      {preset.label}
                    </Btn>
                  ))}
                </div>
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
                <div className="iw-line">
                  <span className="t-label t-muted">Byte order</span>
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
                  <span className="t-label t-muted">Layout</span>
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
                  <label className="iw-check t-label">
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
                    <label className="t-label t-muted" htmlFor={chCountId}>Channels</label>
                    <input
                      id={chCountId}
                      className="iw-input t-label"
                      type="number"
                      min={2}
                      max={8}
                      step={1}
                      value={config.channelCount}
                      onChange={event => {
                        const n = Math.max(2, Math.min(8, Math.floor(Number(event.target.value) || 2)));
                        setConfig(prev => ({ ...prev, channelCount: n }));
                      }}
                    />
                  </div>
                )}
                <div className="iw-line">
                  <label className="t-label t-muted" htmlFor={skipId}>Skip bytes</label>
                  <input
                    id={skipId}
                    className="iw-input iw-input--mult t-label"
                    type="number"
                    min={0}
                    max={Math.max(0, buffer.byteLength - 2)}
                    step={1}
                    value={config.headerBytes}
                    onChange={event => {
                      const n = Math.max(0, Math.floor(Number(event.target.value) || 0));
                      setConfig(prev => ({ ...prev, headerBytes: n }));
                    }}
                  />
                </div>
                <div className="iw-nudges" aria-label="Header skip step">
                  {SKIP_NUDGES.map(item => (
                    <Btn
                      key={item.label}
                      small
                      aria-label={`Skip ${item.label} bytes`}
                      onClick={() => nudgeSkip(item.delta)}
                    >
                      {item.label} B
                    </Btn>
                  ))}
                </div>
                <div className="iw-line">
                  <label className="t-label t-muted" htmlFor={rateId}>Rate (Hz)</label>
                  <input
                    id={rateId}
                    className="iw-input iw-input--mult t-label"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 1M or 0"
                    value={rateDraft}
                    onChange={event => {
                      const raw = event.target.value;
                      setRateDraft(raw);
                      const parsed = parseEngInput(raw, { baseUnit: 'Hz' });
                      if (parsed.ok && parsed.value >= 0) {
                        setConfig(prev => ({ ...prev, sampleRateHz: parsed.value }));
                      }
                    }}
                    onBlur={() => setRateDraft(String(config.sampleRateHz))}
                  />
                </div>
              </section>
            )}

            <section className="iw-group" aria-label="Sample window">
              <h3 className="t-section">Sample slice</h3>
              <div className="iw-line">
                <label className="t-label t-muted" htmlFor={startId}>Start</label>
                <input
                  id={startId}
                  className="iw-input iw-input--mult t-label"
                  type="number"
                  min={0}
                  step={1}
                  value={config.startSample}
                  onChange={event => setConfig(prev => ({ ...prev, startSample: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))}
                />
              </div>
              <div className="iw-line">
                <label className="t-label t-muted" htmlFor={countId}>Samples</label>
                <input
                  id={countId}
                  className="iw-input iw-input--mult t-label"
                  type="number"
                  min={0}
                  step={1}
                  value={config.sampleCount}
                  onChange={event => setConfig(prev => ({ ...prev, sampleCount: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))}
                />
              </div>
              <span className="t-caption">0 = all ({formatCount(preview.totalAvailableSamples)} available)</span>
            </section>

            <section className="iw-group" aria-label="Scaling and units">
              <h3 className="t-section">{config.mode === 'auto-scope' ? 'Global scaling & X axis' : 'Scaling & Units'}</h3>
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
              <div className="iw-line">
                <label className="t-label t-muted" htmlFor={multId}>Y scale ×</label>
                <input
                  id={multId}
                  className="iw-input iw-input--mult t-label"
                  type="text"
                  inputMode="decimal"
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
              <div className="iw-line">
                <label className="t-label t-muted" htmlFor={offId}>Y offset</label>
                <input
                  id={offId}
                  className="iw-input iw-input--mult t-label"
                  type="text"
                  inputMode="decimal"
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
              <div className="iw-line">
                <label className="t-label t-muted" htmlFor={xMultId}>X scale ×</label>
                <input
                  id={xMultId}
                  className="iw-input iw-input--mult t-label"
                  type="text"
                  inputMode="decimal"
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
              <div className="iw-line">
                <label className="t-label t-muted" htmlFor={xOffId}>X offset (t₀)</label>
                <input
                  id={xOffId}
                  className="iw-input iw-input--mult t-label"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. -50u or 0"
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
            {config.mode === 'auto-scope' && preview.headerSummary && (
              <div className="iw-header-summary t-caption" data-testid="binary-wizard-header-summary">
                {preview.headerSummary}
              </div>
            )}
            {pointStats.budget.level !== 'ok' && (
              <section
                className={`iw-budget is-${pointStats.budget.level}`}
                data-testid="binary-wizard-budget"
                data-budget-level={pointStats.budget.level}
                aria-label="Capture size notice"
              >
                <div className="iw-budget-head">
                  <span className={`iw-budget-icon is-${pointStats.budget.level}`}>
                    <Icon name={pointStats.budget.level === 'exceeds-tab' ? 'error' : 'warning'} />
                  </span>
                  <p className="iw-budget-summary t-label" data-testid="binary-wizard-budget-summary">
                    {formatBudgetSummaryLine(pointStats)}
                  </p>
                </div>
                <div className="iw-budget-options" role="radiogroup" aria-label="Import reduction mode">
                  <div className="iw-budget-option">
                    <label className="iw-budget-label t-label">
                      <input
                        type="radio"
                        name={reductionGroupName}
                        value="full"
                        checked={activeReductionMode === 'full'}
                        onChange={() => {
                          setUserPickedReduction(true);
                          setConfig(prev => ({ ...prev, reduction: { mode: 'full' } }));
                        }}
                      />
                      <span><strong>Keep all samples.</strong> Analysis exact.</span>
                    </label>
                    <span
                      className={`t-caption iw-budget-warn${pointStats.budget.level === 'exceeds-tab' ? ' is-danger' : ''}`}
                      data-testid="binary-wizard-keep-all-note"
                    >
                      {keepAllWarningSubtext(pointStats.budget.level, pointStats.budget.estimatedBytes, deviceMemoryGb)}
                    </span>
                  </div>

                  <div className="iw-budget-option">
                    <div className="iw-budget-row">
                      <label className="iw-budget-label t-label">
                        <input
                          type="radio"
                          name={reductionGroupName}
                          value="decimate"
                          checked={activeReductionMode === 'decimate'}
                          onChange={selectDecimateReduction}
                        />
                        <span><strong>Decimate by</strong></span>
                      </label>
                      <input
                        type="number"
                        min={2}
                        step={1}
                        className="iw-input iw-budget-factor t-label"
                        aria-label="Decimate factor"
                        data-testid="binary-wizard-decimate-factor"
                        value={decimateDraft}
                        onFocus={selectDecimateReduction}
                        onChange={event => {
                          const raw = event.target.value;
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
                        onBlur={() => {
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
                      />
                    </div>
                    <span className="t-caption iw-budget-sub" data-testid="binary-wizard-decimate-info">
                      {decimatedRateInfo(
                        preview.sampleRateHz,
                        displayDecimateFactor,
                        pointStats.totalPoints,
                        isSampleIndexAxis(config.mode, effectiveScope !== null, preview.rangeText),
                      )}
                    </span>
                  </div>

                  <div className="iw-budget-option">
                    <label className="iw-budget-label t-label">
                      <input
                        type="radio"
                        name={reductionGroupName}
                        value="envelope"
                        checked={activeReductionMode === 'envelope'}
                        onChange={() => {
                          setUserPickedReduction(true);
                          setConfig(prev => ({
                            ...prev,
                            reduction: { mode: 'envelope', targetPoints: DEFAULT_ENVELOPE_TARGET },
                          }));
                        }}
                      />
                      <span><strong>Display envelope.</strong></span>
                    </label>
                    <span className="t-caption iw-budget-sub">
                      Fast. Analysis tools and sample dots are off for this trace.
                    </span>
                  </div>
                </div>
                <p className="t-caption iw-budget-hint" data-testid="binary-wizard-budget-hint">
                  Or narrow Start / Samples on the left to cut import size.
                </p>
              </section>
            )}
            <div className="iw-preview-head">
              <h3 className="t-section" data-testid="binary-wizard-hex-heading">{hexHeading}</h3>
            </div>
            <pre className="iw-hex t-readout" data-testid="binary-wizard-hex">{preview.hexDump}</pre>
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
          <span className="iw-spacer" />
          {blocker && <span className="iw-blocker t-caption" data-testid="import-wizard-blocker">{blocker}</span>}
          {!editing && total > 1 && <Btn onClick={skipFile}>Skip file</Btn>}
          <Btn onClick={cancel} title="Esc">Cancel</Btn>
          <Btn variant="solid" onClick={() => void confirm()} disabled={!!blocker} title="Enter" data-testid="import-wizard-confirm">{mainLabel}</Btn>
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
