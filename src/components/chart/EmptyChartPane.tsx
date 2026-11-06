import React, { useState, useRef, useCallback } from 'react';
import { DATA_FILE_ACCEPT, useFileImport } from '../../hooks/use-file-import';

export interface EmptyChartPaneProps {
  mode?: 'files' | 'traces';
  /** Pane that browsed files are imported into. Drops bubble to ChartPane, which targets the pane itself. */
  paneId?: string;
  /** Short panes (3–4 stacked): show only the headline so the box fits. */
  compact?: boolean;
}

export function EmptyChartPane({ mode = 'files', paneId, compact = false }: EmptyChartPaneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFiles = useFileImport();
  const isTraceMode = mode === 'traces';

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const hasFiles = e.dataTransfer.types.includes('Files');
    setIsDragOver(isTraceMode ? true : hasFiles);
  }, [isTraceMode]);

  const clearDragOver = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    if (isTraceMode) {
      return;
    }
    fileInputRef.current?.click();
  }, [isTraceMode]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';
    void importFiles(selected, paneId);
  }, [importFiles, paneId]);

  return (
    <>
      <input
        data-testid="empty-chart-file-input"
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        accept={DATA_FILE_ACCEPT}
        onChange={handleFileInput}
      />
      <div
        data-testid={isTraceMode ? 'empty-trace-pane-dropzone' : 'empty-chart-dropzone'}
        onDragOver={handleDragOver}
        onDragLeave={clearDragOver}
        onDrop={clearDragOver}
        onClick={handleClick}
        style={{
          boxSizing: 'border-box',
          height: 'calc(100% - 20px)',
          margin: '10px',
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text)',
          border: isDragOver ? '2px solid var(--accent)' : '1px dashed var(--border)',
          borderRadius: compact ? '10px' : '16px',
          background: isDragOver
            ? 'linear-gradient(180deg, rgba(88,166,255,0.10), rgba(88,166,255,0.04))'
            : 'linear-gradient(180deg, rgba(127,127,127,0.06), rgba(127,127,127,0.02))',
          cursor: isTraceMode ? 'default' : 'pointer',
          transition: 'border-color 0.15s, color 0.15s, background 0.15s, transform 0.15s',
          userSelect: 'none',
        }}
      >
        <div style={{
          boxSizing: 'border-box',
          maxWidth: '760px',
          maxHeight: '100%',
          overflow: 'hidden',
          width: 'calc(100% - 32px)',
          padding: compact ? '8px 12px' : '28px 24px',
          borderRadius: compact ? '10px' : '18px',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          boxShadow: compact ? 'none' : '0 20px 50px rgba(0, 0, 0, 0.08)',
          textAlign: 'center',
          display: 'grid',
          gap: compact ? '2px' : '10px',
          justifyItems: 'center',
        }}>
          {!compact && (
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '999px',
              display: 'grid',
              placeItems: 'center',
              background: isDragOver ? 'rgba(88,166,255,0.14)' : 'rgba(88,166,255,0.08)',
              color: isDragOver ? 'var(--accent)' : 'var(--muted)',
              fontSize: 'var(--font-display)',
              lineHeight: 1,
            }}>
              +
            </div>
          )}
          <div style={{ fontSize: compact ? 'var(--font-title)' : 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.03em' }}>
            {isDragOver ? (isTraceMode ? 'Drop trace to move' : 'Drop to import') : (isTraceMode ? 'Drop traces here' : 'Drop files here')}
          </div>
          <div style={{ fontSize: compact ? 'var(--font-label)' : 'var(--font-emphasis)', color: 'var(--muted)', lineHeight: 1.5, maxWidth: '620px' }}>
            {isTraceMode
              ? (compact ? 'Drag a trace row from the sidebar.' : 'Drag a trace row from the sidebar and drop it in this pane to move it here.')
              : (compact ? '.dat, .csv or .sNp, or click to browse' : 'Drop a .dat, .csv, or Touchstone .s1p/.s2p/.sNp file onto the chart area, or click anywhere here to browse.')}
          </div>
          {!compact && (
            <div style={{ fontSize: 'var(--font-label)', color: 'var(--dim)' }}>
              {isTraceMode
                ? 'You can also use the pane header button to move the selected trace here.'
                : 'The workspace will load the file and show it in the chart once parsing finishes.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
