export interface MRProps {
  label: string;
  value: string | number | { value: number; unit: string };
  hlColor?: string;
  vc?: string;
}

/**
 * Metric Readout Row (MR) — displays a label and value pair in a standardized way.
 * Ported from legacy MR in ui-helpers.js.
 */
export function MR({ label, value, hlColor, vc }: MRProps) {
  let display: string;
  if (typeof value === 'object' && value && 'value' in value) {
    display = `${value.value.toLocaleString()} ${value.unit || ''}`;
  } else {
    display = String(value);
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '3px 0',
      borderBottom: '1px solid var(--border)',
      alignItems: 'baseline'
    }}>
      <span style={{ 
        color: hlColor || 'var(--muted)', 
        fontSize: '12px',
        fontWeight: hlColor ? 600 : 400
      }}>
        {label}
      </span>
      <span style={{ 
        color: vc || 'var(--text)', 
        fontSize: '11px', 
        fontFamily: 'var(--font-mono, monospace)',
        textAlign: 'right'
      }}>
        {display}
      </span>
    </div>
  );
}
