import type { ReactElement } from 'react';

export interface MRProps {
  label: string;
  value: string | number | { value: number; unit: string };
}

/**
 * Key/value row (AC-3): label 11 px muted, value 12 px / 600 in full ink; unit stays muted.
 * Ported from legacy MR in ui-helpers.js.
 */
export function MR({ label, value }: MRProps): ReactElement {
  const unit = typeof value === 'object' && value && 'value' in value ? value.unit : '';
  const text = typeof value === 'object' && value && 'value' in value ? value.value.toLocaleString() : String(value);
  return (
    <div className="ac-kv">
      <span className="ac-kv-k">{label}</span>
      <span className="ac-kv-v">{text}{unit && <span className="ac-kv-u"> {unit}</span>}</span>
    </div>
  );
}
