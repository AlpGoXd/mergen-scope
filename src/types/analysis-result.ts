export type AnalysisFamily = 'spectrum' | 'network' | 'waveform' | 'iq' | 'symbol';

export interface AnalysisResult {
  readonly id: string;
  readonly family: AnalysisFamily;
  readonly type: string;
  readonly label: string;
  readonly sourceDatasetIds: readonly string[];
  readonly sourceDisplayTraceIds: readonly string[];
  readonly summary: Readonly<Record<string, number | string | boolean | null>>;
  readonly payload: unknown;
}

export function makeAnalysisResult(
  id: string,
  family: AnalysisFamily,
  type: string,
  label: string,
  sourceDatasetIds: readonly string[],
  sourceDisplayTraceIds: readonly string[],
  payload: unknown,
  summary: Readonly<Record<string, number | string | boolean | null>> = {},
): AnalysisResult {
  return {
    id,
    family,
    type,
    label,
    sourceDatasetIds,
    sourceDisplayTraceIds,
    summary,
    payload,
  };
}
