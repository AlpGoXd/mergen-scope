import { useFileDispatch, useFileState } from '../../stores/file-store';
import { usePaneState } from '../../stores/pane-store';
import { showPaneWarningBanner, useUiDispatch, useUiState } from '../../stores/ui-store';
import { PaneLayoutGrid } from './PaneLayoutGrid';
import { usePaneImageExport } from './export/export-context';

/**
 * ChartWorkspace component for rendering multiple stacked chart panes.
 * Ported from legacy in app-shell-components.js.
 */
export function ChartWorkspace() {
  const { panes } = usePaneState();
  const { paneAssignmentWarning } = useUiState();
  const { importErrors } = useFileState();
  const uiDispatch = useUiDispatch();
  const fileDispatch = useFileDispatch();
  const imageExport = usePaneImageExport();
  const exportNotice = imageExport?.notice ?? null;

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'hidden',
      minHeight: 0
    }}>
      {importErrors.map((error) => (
        <Notice
          key={error.id}
          testId="import-error"
          message={<><strong>Could not import {error.fileName}:</strong> {error.message}</>}
          onDismiss={() => fileDispatch({ type: 'DISMISS_IMPORT_ERROR', payload: { id: error.id } })}
        />
      ))}
      {paneAssignmentWarning && showPaneWarningBanner(paneAssignmentWarning, panes.map(pane => pane.id)) && (
        <Notice
          message={paneAssignmentWarning.message}
          onDismiss={() => uiDispatch({ type: 'SET', payload: { key: 'paneAssignmentWarning', value: null } })}
        />
      )}
      {exportNotice && imageExport && (
        <Notice
          testId="export-notice"
          message={exportNotice.message}
          action={exportNotice.paneId ? { label: exportNotice.fallback === 'tex' ? 'Download .tex' : 'Download image', run: () => { const { paneId, fallback } = exportNotice; imageExport.dismissNotice(); if (!paneId) return; if (fallback === 'tex') imageExport.downloadLatex(paneId); else imageExport.downloadImage(paneId); } } : undefined}
          onDismiss={imageExport.dismissNotice}
        />
      )}
      <PaneLayoutGrid paneIds={panes.map(pane => pane.id)} />
    </div>
  );
}

function Notice({ message, onDismiss, testId, action }: { message: React.ReactNode; onDismiss: () => void; testId?: string; action?: { label: string; run: () => void } | undefined }) {
  const buttonStyle: React.CSSProperties = { background: 'none', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontSize: 'var(--font-label)' };
  return (
    <div
      role="alert"
      data-testid={testId}
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
        flexShrink: 0,
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {action && <button type="button" onClick={action.run} style={buttonStyle}>{action.label}</button>}
      <button
        type="button"
        onClick={onDismiss}
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
  );
}
