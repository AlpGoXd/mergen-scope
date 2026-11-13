import React from 'react';

export type ButtonVariant = 'neutral' | 'chip' | 'slate' | 'solid' | 'secondary' | 'armed';
export type GroupTone = 'marker' | 'lines' | 'search' | 'export' | 'pane' | 'left' | 'analysis' | 'data';
/** React 19 passes `ref` as a prop; it reaches the <button> through the rest props. */
export interface BtnProps extends React.ComponentPropsWithRef<'button'> {
  active?: boolean; color?: string; soft?: boolean; bold?: boolean;
  variant?: ButtonVariant; tone?: GroupTone; danger?: boolean; small?: boolean;
}
/** Shared button; legacy active/color/soft props remain supported during migration. */
export function Btn({ active, color, soft: _soft, bold, variant, tone, danger, small, children, style, className = '', type = 'button', ...props }: BtnProps) {
  const role = variant ?? (active ? 'chip' : 'neutral');
  const classes = ['ui-btn', `ui-btn--${role}`, active && 'is-active', danger && role === 'solid' && 'is-danger', small && 'is-small', className].filter(Boolean).join(' ');
  const vars = { ...(color ? { '--group-color': color } : {}), ...(tone ? { '--chip-fill': `var(--${tone}-fill)`, '--chip-line': `var(--${tone}-line)`, '--chip-ink': `var(--${tone}-ink)`, '--armed-hue': `var(--${tone}-hue)` } : {}), ...(bold ? { fontWeight: 700 } : {}), ...style } as React.CSSProperties;
  return <button type={type} className={classes} style={vars} aria-pressed={role === 'chip' ? !!active : props['aria-pressed']} {...props}>{children}</button>;
}
