import type { ReactNode } from 'react';
import { usePaneState } from '../../stores/pane-store';
import { defaultTitle } from '../../domain/pane-layout';
import { paneName } from '../../domain/line-view';
import { shortcutText } from '../../domain/shortcuts';
import { usePaneImageExport } from '../chart/export/export-context';
import './export-menu.css';

function Item({ label, keys, reason, note, onSelect }: { label: string; keys?: string; reason?: string | null; note?: ReactNode; onSelect: () => void }) {
  return (
    <button type="button" role="menuitem" className="xm-item" aria-disabled={reason ? true : undefined} title={reason ?? undefined} onClick={reason ? undefined : onSelect}>
      <span className="xm-item__label t-label">{label}{note ? <span className="xm-item__note t-caption">{note}</span> : null}</span>
      {keys ? <kbd className="xm-item__keys t-readout">{keys}</kbd> : null}
    </button>
  );
}

/**
 * Export… in the top bar: acts on the target pane, named once in the header (with its custom name, if any).
 * `onClose` runs before an action so the popover is gone when a toast or a download appears.
 */
export function ExportMenu({ onClose, onExportCsv, csvReason }: { onClose: () => void; onExportCsv: () => void; csvReason: string | null }) {
  const { panes, activePaneId } = usePaneState();
  const imageExport = usePaneImageExport();
  const index = Math.max(0, panes.findIndex(pane => pane.id === activePaneId));
  const target = panes[index]?.id ?? null;
  const position = defaultTitle(index);
  const name = target ? paneName(panes, target) : position;
  const unavailable = (format: 'image' | 'latex') => !target || !imageExport ? 'No pane to export' : imageExport.unavailable(target, format);
  const run = (action: (paneId: string) => void) => () => { onClose(); if (target) action(target); };
  return (
    <div className="xm" role="menu" aria-label="Export">
      <div className="xm-head" role="presentation">
        <div className="t-card-title" data-testid="export-menu-title">Export · {position}{name !== position ? <span className="xm-head__custom t-caption">{name}</span> : null}</div>
        <div className="t-caption">the target pane · click a pane to change it</div>
      </div>
      <Item label="Copy image" keys={shortcutText('copy-image')} reason={unavailable('image')} onSelect={run(paneId => imageExport?.copyImage(paneId))} />
      <Item label="Download image" keys={shortcutText('download-image')} reason={unavailable('image')} onSelect={run(paneId => imageExport?.downloadImage(paneId))} />
      <Item label="Download SVG" reason={unavailable('image')} onSelect={run(paneId => imageExport?.downloadSvg(paneId))} />
      <Item label="Copy as LaTeX" reason={unavailable('latex')} onSelect={run(paneId => imageExport?.copyLatex(paneId))} />
      <div className="xm-sep" role="separator" />
      <Item label="Export data (CSV)…" reason={csvReason} onSelect={() => { onClose(); onExportCsv(); }} />
      <Item label="All panes…" reason="Coming with the export dialog" note="Coming with the export dialog" onSelect={() => {}} />
    </div>
  );
}
