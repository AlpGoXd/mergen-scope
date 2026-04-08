import React, { useState, useRef, useCallback } from 'react';
import { useFileDispatch } from '../../stores/file-store';

export interface EmptyChartPaneProps {
  mode?: 'files' | 'traces';
}

export function EmptyChartPane({ mode = 'files' }: EmptyChartPaneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDispatch = useFileDispatch();
  const isTraceMode = mode === 'traces';

  const loadFiles = useCallback(async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      const text = await f.text();
      fileDispatch({
        type: 'QUEUE_WIZARD',
        payload: { fileName: f.name, rawText: text, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      });
    }
  }, [fileDispatch]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const hasFiles = e.dataTransfer.types.includes('Files');
    setIsDragOver(isTraceMode ? true : hasFiles);
  }, [isTraceMode]);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault();
    setIsDragOver(false);
    if (isTraceMode) {
      return;
    }
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      await loadFiles(e.dataTransfer.files);
    }
  }, [isTraceMode, loadFiles]);

  const handleClick = useCallback(() => {
    if (isTraceMode) {
      return;
    }
    fileInputRef.current?.click();
  }, [isTraceMode]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    if (e.target.files && e.target.files.length > 0) {
      await loadFiles(e.target.files);
      e.target.value = '';
    }
  }, [loadFiles]);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={handleFileInput}
      />
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        style={{
          height: '100%',
          minHeight: '320px',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text)',
          border: isDragOver ? '2px solid var(--accent)' : '1px dashed var(--border)',
          borderRadius: '16px',
          margin: '10px',
          background: isDragOver
            ? 'linear-gradient(180deg, rgba(88,166,255,0.10), rgba(88,166,255,0.04))'
            : 'linear-gradient(180deg, rgba(127,127,127,0.06), rgba(127,127,127,0.02))',
          cursor: 'pointer',
          transition: 'border-color 0.15s, color 0.15s, background 0.15s, transform 0.15s',
          userSelect: 'none',
        }}
      >
        <div style={{
          maxWidth: '760px',
          width: 'calc(100% - 32px)',
          padding: '28px 24px',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.08)',
          textAlign: 'center',
          display: 'grid',
          gap: '10px',
          justifyItems: 'center',
        }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '999px',
            display: 'grid',
            placeItems: 'center',
            background: isDragOver ? 'rgba(88,166,255,0.14)' : 'rgba(88,166,255,0.08)',
            color: isDragOver ? 'var(--accent)' : 'var(--muted)',
            fontSize: '24px',
            lineHeight: 1,
          }}>
            +
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-0.03em' }}>
            {isDragOver ? (isTraceMode ? 'Drop trace to move' : 'Drop to import') : (isTraceMode ? 'Drop traces here' : 'Drop files here')}
          </div>
          <div style={{ fontSize: '15px', color: 'var(--muted)', lineHeight: 1.5, maxWidth: '620px' }}>
            {isTraceMode
              ? 'Drag a trace row from the sidebar and drop it in this pane to move it here.'
              : 'Drop a .dat, .csv, or Touchstone .s1p/.s2p/.sNp file onto the chart area, or click anywhere here to browse.'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--dim)' }}>
            {isTraceMode
              ? 'You can also use the pane header button to move the selected trace here.'
              : 'The workspace will load the file and show it in the chart once parsing finishes.'}
          </div>
        </div>
      </div>
    </>
  );
}
