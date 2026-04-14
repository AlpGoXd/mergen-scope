import type { DatasetBasis, DatasetFamily, NetworkParameterFamily } from './dataset';
import type { InterpolationStrategy } from './interpolation';

export type DisplayTraceKind = 'dataset-projection' | 'derived-trace';
export type DisplayViewMode = 'cartesian' | 'smith' | 'polar' | 'eye' | 'constellation';
export type ScalarTraceSemantics =
  | 'magnitude'
  | 'phase'
  | 'real'
  | 'imag'
  | 'group-delay'
  | 'vswr'
  | 'return-loss'
  | 'stability'
  | 'time-amplitude'
  | 'power-density'
  | 'custom';
export type ComplexTraceSemantics =
  | 'network-parameter'
  | 'impedance'
  | 'admittance'
  | 'transfer'
  | 'iq'
  | 'custom';

export type DisplayTraceSourceRef =
  | {
      readonly sourceType: 'series';
      readonly datasetFamily: Exclude<DatasetFamily, 'network' | 'iq' | 'symbol'>;
      readonly seriesId: string;
    }
  | {
      readonly sourceType: 'network-parameter';
      readonly parameterFamily: NetworkParameterFamily;
      readonly basis: DatasetBasis;
      readonly row: number;
      readonly col: number;
      readonly component:
        | 'complex'
        | 'magnitude-db'
        | 'magnitude-linear'
        | 'phase'
        | 'real'
        | 'imag'
        | 'vswr'
        | 'return-loss'
        | 'group-delay'
        | 'stability-k'
        | 'stability-mu1'
        | 'stability-mu2'
        | 'stability-muprime';
    }
  | {
      readonly sourceType: 'iq';
      readonly component: 'iq' | 'constellation' | 'eye';
    }
  | {
      readonly sourceType: 'symbol';
      readonly component: 'constellation' | 'eye';
    };

export interface DisplayTraceBase {
  readonly id: string;
  readonly kind: DisplayTraceKind;
  readonly label: string;
  readonly datasetId: string;
  readonly family: DatasetFamily;
  readonly hidden?: boolean;
  readonly isUniform?: boolean;
  readonly interpolation?: InterpolationStrategy;
  readonly provenance: {
    readonly parentDatasetId: string;
    readonly parentDisplayTraceIds: readonly string[];
    readonly transformSteps: readonly string[];
  };
  readonly source: DisplayTraceSourceRef;
  readonly supportedViews: readonly DisplayViewMode[];
  readonly defaultView: DisplayViewMode;
  readonly compat?: {
    readonly legacyTraceName?: string;
    readonly legacyDisplayName?: string;
  };
}

export interface ScalarDisplayPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScalarDisplayTrace extends DisplayTraceBase {
  readonly valueType: 'scalar';
  readonly xUnit: string | null;
  readonly yUnit: string | null;
  readonly semantics: ScalarTraceSemantics;
  readonly points: readonly ScalarDisplayPoint[];
}

export interface ComplexDisplayPoint {
  readonly x: number;
  readonly re: number;
  readonly im: number;
}

export interface ComplexDisplayTrace extends DisplayTraceBase {
  readonly valueType: 'complex';
  readonly xUnit: string | null;
  readonly valueUnit: string | null;
  readonly semantics: ComplexTraceSemantics;
  readonly points: readonly ComplexDisplayPoint[];
}

export type DisplayTrace = ScalarDisplayTrace | ComplexDisplayTrace;

export function makeDisplayTraceProvenance(
  parentDatasetId: string,
  parentDisplayTraceIds: readonly string[] = [],
  transformSteps: readonly string[] = [],
): DisplayTraceBase['provenance'] {
  return {
    parentDatasetId,
    parentDisplayTraceIds,
    transformSteps,
  };
}

export function makeScalarDisplayTrace(
  id: string,
  label: string,
  datasetId: string,
  source: DisplayTraceSourceRef,
  points: readonly ScalarDisplayPoint[],
  options: {
    hidden?: boolean;
    family?: DatasetFamily;
    isUniform?: boolean;
    interpolation?: InterpolationStrategy;
    supportedViews?: readonly DisplayViewMode[];
    defaultView?: DisplayViewMode;
    xUnit?: string | null;
    yUnit?: string | null;
    semantics?: ScalarTraceSemantics;
    compat?: DisplayTraceBase['compat'];
    provenance?: DisplayTraceBase['provenance'];
  } = {},
): ScalarDisplayTrace {
  return {
    id,
    kind: 'dataset-projection',
    label,
    datasetId,
    family: options.family ?? 'spectrum',
    hidden: options.hidden ?? false,
    isUniform: options.isUniform ?? false,
    interpolation: options.interpolation,
    provenance:
      options.provenance ?? makeDisplayTraceProvenance(datasetId, [], []),
    source,
    supportedViews: options.supportedViews ?? ['cartesian'],
    defaultView: options.defaultView ?? 'cartesian',
    compat: options.compat,
    valueType: 'scalar',
    xUnit: options.xUnit ?? null,
    yUnit: options.yUnit ?? null,
    semantics: options.semantics ?? 'custom',
    points,
  };
}

export function makeComplexDisplayTrace(
  id: string,
  label: string,
  datasetId: string,
  source: DisplayTraceSourceRef,
  points: readonly ComplexDisplayPoint[],
  options: {
    hidden?: boolean;
    family?: DatasetFamily;
    isUniform?: boolean;
    interpolation?: InterpolationStrategy;
    supportedViews?: readonly DisplayViewMode[];
    defaultView?: DisplayViewMode;
    xUnit?: string | null;
    valueUnit?: string | null;
    semantics?: ComplexTraceSemantics;
    compat?: DisplayTraceBase['compat'];
    provenance?: DisplayTraceBase['provenance'];
  } = {},
): ComplexDisplayTrace {
  return {
    id,
    kind: 'dataset-projection',
    label,
    datasetId,
    family: options.family ?? 'network',
    hidden: options.hidden ?? false,
    isUniform: options.isUniform ?? false,
    interpolation: options.interpolation,
    provenance:
      options.provenance ?? makeDisplayTraceProvenance(datasetId, [], []),
    source,
    supportedViews: options.supportedViews ?? ['cartesian'],
    defaultView: options.defaultView ?? 'cartesian',
    compat: options.compat,
    valueType: 'complex',
    xUnit: options.xUnit ?? null,
    valueUnit: options.valueUnit ?? null,
    semantics: options.semantics ?? 'custom',
    points,
  };
}

export function isScalarDisplayTrace(trace: DisplayTrace | null | undefined): trace is ScalarDisplayTrace {
  return !!trace && trace.valueType === 'scalar';
}

export function isComplexDisplayTrace(trace: DisplayTrace | null | undefined): trace is ComplexDisplayTrace {
  return !!trace && trace.valueType === 'complex';
}
