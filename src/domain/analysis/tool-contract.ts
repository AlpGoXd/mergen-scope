import type {
  AnalysisTool,
  ParameterField,
  ParameterValue,
  ParameterSchema,
  ParameterValues,
  ParameterValidationError,
  ParameterValidationResult,
} from '../../types/registry-contract';

function defaultFor(field: ParameterField): ParameterValue {
  return field.defaultValue;
}

function isParameterValueValid(field: ParameterField, value: unknown): value is ParameterValue {
  if (field.kind === 'number') {
    return typeof value === 'number' && Number.isFinite(value)
      && (field.min === undefined || value >= field.min)
      && (field.max === undefined || value <= field.max);
  }
  if (field.kind === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'string') return false;
  return field.kind !== 'choice' || field.options.includes(value);
}

/** Validate caller input, filling omitted fields with schema defaults and rejecting unknown keys. */
export function validateParameters<Schema extends ParameterSchema>(
  schema: Schema,
  input: unknown,
): ParameterValidationResult<Schema> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { valid: false, errors: [{ key: '', message: 'Parameters must be an object.' }] };
  }

  const supplied = input as Readonly<Record<string, unknown>>;
  const values: Record<string, ParameterValue> = {};
  const errors: ParameterValidationError[] = [];

  for (const key of Object.keys(supplied)) {
    if (!Object.hasOwn(schema, key)) errors.push({ key, message: 'Unknown parameter.' });
  }
  for (const [key, field] of Object.entries(schema)) {
    const value = Object.hasOwn(supplied, key) ? supplied[key] : defaultFor(field);
    if (!isParameterValueValid(field, value)) {
      errors.push({ key, message: `Invalid value for ${field.title}.` });
    } else {
      values[key] = value;
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, values: values as ParameterValues<Schema> };
}

/** Validate a tool's caller-supplied parameters against its declarative schema. */
export function validateToolParameters<Schema extends ParameterSchema>(
  tool: Pick<AnalysisTool<Schema>, 'params'>,
  input: unknown,
): ParameterValidationResult<Schema> {
  return validateParameters(tool.params, input);
}

export type { AnalysisTool, ParameterField, ParameterSchema, ParameterValidationResult };
