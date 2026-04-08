import { mirrorSmithCoord } from '../../domain/smith-coords';
import { useTheme } from '../../hooks/use-theme';

export interface SmithGridProps {
  mode: 'smith' | 'smith-inverted';
  clipId: string;
}

/**
 * Smith Chart Grid (Circles and Axes).
 * Ported from legacy renderSmithGrid in app-chart-components.js.
 */
export function SmithGrid({ mode, clipId }: SmithGridProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'glass';
  
  const stroke = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
  const major = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)';
  const axis = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)';
  const outer = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
  const bgFill = mode === 'smith-inverted' 
    ? (isDark ? 'rgba(90,170,150,0.06)' : 'rgba(90,170,150,0.04)')
    : (isDark ? 'rgba(90,140,190,0.06)' : 'rgba(90,140,190,0.04)');

  const gx = (v: number) => mirrorSmithCoord(v, mode);
  const gy = (v: number) => mirrorSmithCoord(v, mode);

  const resistanceCircles = [0, 0.2, 0.5, 1, 2, 5].map((r) => {
    const cx = 50 + 42 * (r / (1 + r));
    const radius = 42 / (1 + r);
    const isMajor = r === 1;
    return (
      <circle 
        key={`r-${r}`} 
        cx={gx(cx)} cy={gy(50)} r={radius} 
        fill="none" 
        stroke={isMajor ? major : stroke} 
        strokeWidth={isMajor ? 0.3 : 0.15} 
        strokeDasharray={isMajor ? "" : "1 2"} 
      />
    );
  });

  const reactanceCircles = [0.2, 0.5, 1, 2, 5].flatMap(x => {
    const radius = 42 / x;
    const cyTop = 50 - (42 / x);
    const cyBottom = 50 + (42 / x);
    return [
      <circle 
        key={`xt-${x}`} cx={gx(92)} cy={gy(cyTop)} r={radius} 
        fill="none" stroke={stroke} strokeWidth={0.15} 
        strokeDasharray="1 2" clipPath={`url(#${clipId})`} 
      />,
      <circle 
        key={`xb-${x}`} cx={gx(92)} cy={gy(cyBottom)} r={radius} 
        fill="none" stroke={stroke} strokeWidth={0.15} 
        strokeDasharray="1 2" clipPath={`url(#${clipId})`} 
      />
    ];
  });

  return (
    <>
      <circle cx={gx(50)} cy={gy(50)} r={42} fill={bgFill} stroke="none" />
      <circle cx={gx(50)} cy={gy(50)} r={42} fill="none" stroke={outer} strokeWidth={0.35} />
      <line x1={gx(8)} y1={gy(50)} x2={gx(92)} y2={gy(50)} stroke={axis} strokeWidth={0.25} />
      {resistanceCircles}
      {reactanceCircles}
      <circle cx={gx(50)} cy={gy(50)} r={0.6} fill={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
    </>
  );
}
