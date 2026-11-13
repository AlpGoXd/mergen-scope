import React from 'react';

/**
 * Section header for sidebars and panels.
 */
export function Sec({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{
      fontSize: 'var(--font-caption)',
      textTransform: 'uppercase',
      color: 'var(--muted)',
      letterSpacing: '0.12em',
      marginBottom: '0.45rem',
      marginTop: first ? '0' : '0',
      fontWeight: 400
    }}>
      {children}
    </div>
  );
}

