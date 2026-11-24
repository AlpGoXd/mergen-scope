import { formatEngineeringValue } from '../../domain/format';
import type { BinaryImportConfig } from '../../domain/parsers/raw-binary';
import { formatBytes } from '../../domain/point-budget';
import type { PointBudget, PointBudgetLevel } from '../../domain/point-budget';
import { Icon } from '../shared/Controls';

export const DEFAULT_ENVELOPE_TARGET = 16_000;

export interface BinaryPointBudgetStats {
  readonly channelCount: number;
  readonly perChannelSamples: number | null;
  readonly totalPoints: number;
  readonly budget: PointBudget;
}

export function formatCompactPoints(points: number): string {
  if (!Number.isFinite(points) || points <= 0) return '0';
  if (points >= 1_000_000) return `${Number((points / 1_000_000).toFixed(2))} M`;
  if (points >= 1_000) return `${Number((points / 1_000).toFixed(2))} k`;
  return String(Math.round(points));
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

export interface BinaryPointBudgetBannerProps {
  readonly pointStats: BinaryPointBudgetStats;
  readonly reductionGroupName: string;
  readonly activeReductionMode: 'full' | 'decimate' | 'envelope';
  readonly decimateDraft: string;
  readonly displayDecimateFactor: number;
  readonly recommendedFactor: number;
  readonly deviceMemoryGb?: number;
  readonly sampleRateHz: number | null;
  readonly mode: BinaryImportConfig['mode'];
  readonly hasScopeSignature: boolean;
  readonly rangeText: string | null;
  readonly currentReduction: BinaryImportConfig['reduction'];
  readonly onSelectFull: () => void;
  readonly onSelectDecimate: () => void;
  readonly onDecimateDraftChange: (raw: string) => void;
  readonly onDecimateBlur: () => void;
  readonly onSelectEnvelope: () => void;
}

export function BinaryPointBudgetBanner({
  pointStats,
  reductionGroupName,
  activeReductionMode,
  decimateDraft,
  displayDecimateFactor,
  deviceMemoryGb,
  sampleRateHz,
  mode,
  hasScopeSignature,
  rangeText,
  onSelectFull,
  onSelectDecimate,
  onDecimateDraftChange,
  onDecimateBlur,
  onSelectEnvelope,
}: BinaryPointBudgetBannerProps) {
  if (pointStats.budget.level === 'ok') return null;

  return (
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
              onChange={onSelectFull}
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
                onChange={onSelectDecimate}
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
              onFocus={onSelectDecimate}
              onChange={event => onDecimateDraftChange(event.target.value)}
              onBlur={onDecimateBlur}
            />
          </div>
          <span className="t-caption iw-budget-sub" data-testid="binary-wizard-decimate-info">
            {decimatedRateInfo(
              sampleRateHz,
              displayDecimateFactor,
              pointStats.totalPoints,
              isSampleIndexAxis(mode, hasScopeSignature, rangeText),
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
              onChange={onSelectEnvelope}
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
  );
}
