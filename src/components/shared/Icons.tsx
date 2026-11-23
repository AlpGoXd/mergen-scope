import type { ReactElement } from 'react';

export interface IconProps {
  size?: number;
  className?: string;
}

function SvgIcon({ size = 12, className, d }: IconProps & { d: string }): ReactElement {
  return (
    <svg
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export function CloseIcon(props: IconProps): ReactElement {
  return <SvgIcon {...props} d="M6 6l12 12M18 6L6 18" />;
}

export function CaretDownIcon(props: IconProps): ReactElement {
  return <SvgIcon {...props} d="M6 9l6 6 6-6" />;
}

export function CaretUpIcon(props: IconProps): ReactElement {
  return <SvgIcon {...props} d="M6 15l6-6 6 6" />;
}

export function ChevronLeftIcon(props: IconProps): ReactElement {
  return <SvgIcon {...props} d="M15 6l-6 6 6 6" />;
}

export function ChevronRightIcon(props: IconProps): ReactElement {
  return <SvgIcon {...props} d="M9 6l6 6-6 6" />;
}

export function ChevronUpIcon(props: IconProps): ReactElement {
  return <SvgIcon {...props} d="M6 15l6-6 6 6" />;
}

export function CheckIcon(props: IconProps): ReactElement {
  return <SvgIcon {...props} d="M5 12.5l4.5 4.5 9.5-9.5" />;
}
