import type { Trace } from './trace';
import type { Marker } from './marker';
import type { RefLine } from './ref-line';
import type { TouchstoneContext } from './analysis';
import type { PaneRenderMode } from './pane';

/** A capability check either succeeds or explains why the operation is unavailable. */
export type Capability =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export type DataKindId = 'spectrum' | 'waveform' | 'network';

export interface DataKindDefinition {
  readonly id: DataKindId;
  readonly title: string;
  readonly description: string;
  readonly xDomain: 'frequency' | 'time';
  readonly xUnit: 'Hz' | 's';
}

export type PaneTypeId = 'chart' | 'table' | 'smith' | 'polar' | 'eye' | 'spectrogram';

export interface PaneTypeDefinition {
  readonly id: PaneTypeId;
  readonly title: string;
  readonly description: string;
  readonly source?: 'pane' | 'analysis';
  readonly status: 'available' | 'later';
  readonly laterReason?: string;
  readonly iconKey: PaneTypeId;
  readonly settings: readonly string[];
  readonly renderMode: PaneRenderMode | null;
  readonly appliesTo: (trace: Trace) => Capability;
}

export type AnalysisToolKind = 'math' | 'measure' | 'view';

export interface AnalysisToolMetadata {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export type ParameterValue = number | string | boolean;

export type ParameterField =
  | {
      readonly kind: 'number';
      readonly title: string;
      readonly defaultValue: number;
      readonly min?: number;
      readonly max?: number;
    }
  | {
      readonly kind: 'text';
      readonly title: string;
      readonly defaultValue: string;
    }
  | {
      readonly kind: 'boolean';
      readonly title: string;
      readonly defaultValue: boolean;
    }
  | {
      readonly kind: 'choice';
      readonly title: string;
      readonly defaultValue: string;
      readonly options: readonly string[];
    };

export type ParameterSchema = Readonly<Record<string, ParameterField>>;

type ValueForField<Field extends ParameterField> =
  Field extends { readonly kind: 'number' } ? number :
  Field extends { readonly kind: 'boolean' } ? boolean :
  Field extends { readonly kind: 'choice'; readonly options: readonly (infer Option extends string)[] } ? Option :
  string;

export type ParameterValues<Schema extends ParameterSchema> = {
  readonly [Key in keyof Schema]: ValueForField<Schema[Key]>;
};

export interface ParameterValidationError {
  readonly key: string;
  readonly message: string;
}

export type ParameterValidationResult<Schema extends ParameterSchema> =
  | { readonly valid: true; readonly values: ParameterValues<Schema> }
  | { readonly valid: false; readonly errors: readonly ParameterValidationError[] };

export interface AnalysisInputs {
  readonly traces: readonly Trace[];
  readonly markers?: readonly Marker[];
  readonly visibleRange?: { readonly left: number; readonly right: number } | null;
  readonly lines?: readonly RefLine[];
  readonly lineId?: number | null;
  readonly tracePaneMap?: Readonly<Record<string, readonly string[]>>;
  readonly vis?: Readonly<Record<string, boolean>>;
  readonly touchstone?: TouchstoneContext | null;
}

export type TableCell = string | number | boolean | null;

export type OverlayShape =
  | { readonly kind: 'triangle'; readonly x: number; readonly y: number; readonly n: number }
  | { readonly kind: 'dot'; readonly x: number; readonly y: number }
  | { readonly kind: 'band'; readonly x1: number; readonly x2: number; readonly y1?: number; readonly y2?: number }
  | { readonly kind: 'tick'; readonly x: number; readonly y: number };

export type AnalysisOutput =
  | { readonly type: 'numbers'; readonly values: Readonly<Record<string, number>> }
  | {
      readonly type: 'table';
      readonly columns: readonly { readonly id: string; readonly title: string }[];
      readonly rows: readonly (readonly TableCell[])[];
    }
  | { readonly type: 'overlay'; readonly points: readonly { readonly x: number; readonly y: number }[] }
  | { readonly type: 'shapes'; readonly shapes: readonly OverlayShape[] }
  | { readonly type: 'trace'; readonly trace: Trace };

export type AnalysisOutputDeclaration =
  | { readonly type: 'numbers'; readonly units?: Readonly<Record<string, string>> }
  | { readonly type: 'table' }
  | { readonly type: 'overlay' }
  | { readonly type: 'shapes' }
  | { readonly type: 'trace' };

/** Pure, typed contract for one analysis module; computation has no UI/store dependency. */
type OutputForDeclarations<Declarations extends readonly AnalysisOutputDeclaration[]> =
  Extract<AnalysisOutput, { readonly type: Declarations[number]['type'] }>;

export interface AnalysisTool<
  Schema extends ParameterSchema,
  Declarations extends readonly AnalysisOutputDeclaration[] = readonly AnalysisOutputDeclaration[],
> {
  readonly kind: AnalysisToolKind;
  readonly addable?: boolean;
  readonly parameterUnits?: Readonly<Record<string, string>>;
  readonly appliesToInputs?: (inputs: AnalysisInputs) => Capability;
  readonly meta: AnalysisToolMetadata;
  readonly params: Schema;
  readonly outputs: Declarations;
  readonly appliesTo: (trace: Trace) => Capability;
  readonly compute: (inputs: AnalysisInputs, params: ParameterValues<Schema>) => readonly OutputForDeclarations<Declarations>[];
}
