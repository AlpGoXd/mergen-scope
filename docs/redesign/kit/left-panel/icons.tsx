// Line icons, 24-unit grid, stroke 1.75, round caps (Tokens: icons 16 px, stroke 1.75). No emoji.
import type { ReactElement } from 'react';

interface IconProps { size?: number }

function Svg({ size = 12, d }: IconProps & { d: string }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const IconOpen = (p: IconProps): ReactElement => <Svg {...p} d="M3 7h6l2 2h10v10H3zM3 7V5h6" />;
export const IconLink = (p: IconProps): ReactElement => (
  <Svg {...p} d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
);
