import { useUiState } from '../../stores/ui-store';
import { AnalysisPanelStack } from '../analysis/AnalysisPanelStack';

/** The right panel holds only Analysis (spec 5.5). It is closed by default and opened by the top-bar Analysis chip or by adding an analysis. */
export function RightPanelStack({ width = 280 }: { width?: number }) {
  const { showRightPanel } = useUiState();
  if (!showRightPanel) return null;
  return (
    <aside style={{ width: `${width}px`, minWidth: '220px', maxWidth: 'min(45vw, 600px)', borderLeft: '1px solid var(--border)', background: 'var(--panel)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AnalysisPanelStack />
    </aside>
  );
}
