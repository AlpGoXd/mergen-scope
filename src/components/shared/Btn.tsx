import React from 'react';

export interface BtnProps extends React.ComponentPropsWithoutRef<'button'> {
  active?: boolean;
  color?: string;
  soft?: boolean;
  bold?: boolean;
  children?: React.ReactNode;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
  title?: string;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Common styled button component for Mergen Scope.
 * Uses CSS color-mix() for transparent tints — works with both
 * hex colors and CSS custom properties (var(--accent) etc.).
 */
export function Btn({
  active,
  color = 'var(--accent)',
  soft,
  bold,
  children,
  style,
  className,
  disabled,
  ...props
}: BtnProps) {

  // color-mix works with any valid CSS color including var() references
  const tint26 = `color-mix(in srgb, ${color} 26%, white)`;
  const tint18 = `color-mix(in srgb, ${color} 18%, white)`;
  const tint42 = `color-mix(in srgb, ${color} 42%, white)`;

  const btnStyle: React.CSSProperties = {
    background: active ? tint26 : (soft ? tint18 : 'transparent'),
    border: `1px solid ${active ? color : (soft ? tint42 : 'var(--border)')}`,
    color: active ? color : 'var(--text)',
    borderRadius: '6px',
    padding: '5px 10px',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    fontWeight: bold ? 600 : 500,
    opacity: disabled ? 0.4 : 1,
    lineHeight: '1.4',
    transition: 'all 0.15s ease-in-out',
    ...style,
  };

  return (
    <button className={className} disabled={disabled} style={btnStyle} {...props}>
      {children}
    </button>
  );
}
