// Line icons for the Analysis kit: 24-unit grid, stroke 1.75, round caps. No emoji.
import type { ReactElement } from 'react';

interface IconProps { size?: number }
function Svg({ size = 13, d }: IconProps & { d: string }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>
  );
}
export const IconRuler = (p: IconProps): ReactElement => <Svg {...p} d="M3 17l14-14 4 4-14 14zM7 13l2 2M10 10l2 2M13 7l2 2" />;
export const IconSearch = (p: IconProps): ReactElement => <Svg {...p} d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />;
export const IconEye = (p: IconProps): ReactElement => <Svg {...p} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />;
export const IconEyeOff = (p: IconProps): ReactElement => <Svg {...p} d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />;
export const IconWarn = (p: IconProps): ReactElement => <Svg {...p} d="M12 3l10 18H2zM12 10v5M12 18v.5" />;

/** ƒ: the Math mark (a glyph, not an icon). */
export const Fx = (): ReactElement => (
  <span aria-hidden="true" style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic', fontWeight: 700 }}>ƒ</span>
);
