import { useFileState } from '../../stores/file-store';

/**
 * FooterBar component for app-level status and controls.
 * Ported from legacy FooterBar in app-shell-components.js.
 */
export function FooterBar() {
  const { files } = useFileState();
  const hasData = files.length > 0;

  if (!hasData) return null;

  const hints = [
    { action: "L-click", effect: "select / place" },
    { action: "L-drag", effect: "move marker / ref line" },
    { action: "R-drag", effect: "X zoom / pan" },
    { action: "Wheel", effect: "Y zoom" },
    { action: "Shift + Wheel", effect: "Y pan" },
    { action: "Middle click", effect: "reset X + Y" }
  ];

  return (
    <div style={{
      padding: '10px 12px 12px',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
      flexShrink: 0,
      background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.015))'
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        color: 'var(--muted)'
      }}>
        Controls
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '8px',
        maxWidth: '980px'
      }}>
        {hints.map((item) => (
          <div key={item.action} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            background: 'var(--card)',
            fontSize: '11px',
            lineHeight: 1.2,
            boxShadow: '0 1px 0 rgba(0,0,0,0.03)'
          }}>
            <span style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {item.action}
            </span>
            <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>
              {item.effect}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
