import { usePaneState } from '../../stores/pane-store';
import { useUiDispatch, useUiState } from '../../stores/ui-store';
import { ChartPane } from './ChartPane';

/**
 * ChartWorkspace component for rendering multiple stacked chart panes.
 * Ported from legacy in app-shell-components.js.
 */
export function ChartWorkspace() {
  const { panes } = usePaneState();
  const { paneAssignmentWarning } = useUiState();
  const uiDispatch = useUiDispatch();

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'hidden',
      minHeight: 0
    }}>
      {paneAssignmentWarning && (
        <div
          style={{
            margin: '10px 10px 0',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 184, 77, 0.45)',
            background: 'rgba(255, 184, 77, 0.12)',
            color: 'var(--text)',
            fontSize: 'var(--font-body)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ flex: 1 }}>{paneAssignmentWarning.message}</span>
          <button
            type="button"
            onClick={() => uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } })}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              borderRadius: '6px',
              padding: '2px 8px',
              cursor: 'pointer',
              fontSize: 'var(--font-label)',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {panes.map((pane) => (
        <ChartPane key={pane.id} paneId={pane.id} />
      ))}
    </div>
  );
}
