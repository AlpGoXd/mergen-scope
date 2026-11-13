import type { ChartScaleProps } from '../LinesLayer';

/** Print look: a black frame around the plot area (Recharts passes the plot offset to Customized layers). */
export function ExportFrame({ offset }: ChartScaleProps) {
  if (!offset) return null;
  return <rect data-export-frame="" x={offset.left} y={offset.top} width={offset.width} height={offset.height} fill="none" stroke="var(--text)" strokeWidth={1} />;
}
