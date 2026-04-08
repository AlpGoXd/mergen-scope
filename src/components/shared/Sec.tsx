import React from 'react';

/**
 * Section header for sidebars and panels.
 */
export function Sec({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{
      fontSize: '11px',
      textTransform: 'uppercase',
      color: 'var(--muted)',
      letterSpacing: '1px',
      marginBottom: '8px',
      marginTop: first ? '0' : '16px',
      fontWeight: 700
    }}>
      {children}
    </div>
  );
}
