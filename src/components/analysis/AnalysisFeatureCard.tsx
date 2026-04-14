import React from 'react';

export interface AnalysisFeatureCardProps {
  title: string;
  description?: string;
  color?: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  children?: React.ReactNode;
  first?: boolean;
}

/**
 * Common card component for the analysis panel stack.
 * Ported from legacy in app-analysis-components.js.
 */
export function AnalysisFeatureCard({ 
  title, 
  description, 
  color = 'var(--accent)', 
  icon, 
  onClose, 
  children,
  first 
}: AnalysisFeatureCardProps) {
  return (
    <div 
      className="animate-fade-in"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 12%, var(--bg)), var(--card))`,
        border: `1px solid color-mix(in srgb, ${color} 32%, var(--border))`,
        borderRadius: '12px',
        padding: '12px 12px 10px',
        marginBottom: '10px',
        marginTop: first ? 0 : '10px',
        position: 'relative',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {icon || (
          <div style={{ width: '4px', height: '20px', background: color, borderRadius: '2px', flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 'var(--font-title)', fontWeight: 600, color: 'var(--text)', flex: 1, lineHeight: 1.2 }}>
          {title}
        </span>
        {onClose && (
          <button 
            onClick={onClose}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--muted)', 
              cursor: 'pointer', 
              fontSize: 'var(--font-display)',
              padding: '0 4px',
              lineHeight: 1
            }}
          >
            &times;
          </button>
        )}
      </div>

      {description && (
        <div style={{ fontSize: 'var(--font-label)', color: 'var(--muted)', lineHeight: '1.5' }}>
          {description}
        </div>
      )}

      {children}
    </div>
  );
}
