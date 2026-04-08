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
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        marginTop: first ? 0 : '12px',
        position: 'relative',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {icon || (
          <div style={{ width: '8px', height: '18px', background: color, borderRadius: '4px' }} />
        )}
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', flex: 1 }}>
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
              fontSize: '18px',
              padding: '0 4px',
              lineHeight: 1
            }}
          >
            &times;
          </button>
        )}
      </div>

      {description && (
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>
          {description}
        </div>
      )}

      {children}
    </div>
  );
}
