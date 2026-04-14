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
  color, // Keep the prop in case some caller passes it but ignore it for styling, unless it's a data trace? 
         // Actually, wait, "Saturated colors (Mint, Teal, Orange-Red) are reserved strictly for data traces on the plot." 
         // So Btn doesn't need to use `color` at all. The buttons on toolbars won't use it.
  soft,
  bold,
  children,
  style,
  className,
  disabled,
  ...props
}: BtnProps) {
  
  const baseClass = active ? 'btn-active' : 'btn';
  const combinedClassName = className ? `${baseClass} ${className}` : baseClass;

  const mergedStyle: React.CSSProperties = {
    opacity: disabled ? 0.45 : 1,
    ...(color ? ({ '--group-color': color } as React.CSSProperties) : {}),
    ...style,
  };

  return (
    <button className={combinedClassName} disabled={disabled} style={mergedStyle} {...props}>
      {children}
    </button>
  );
}
