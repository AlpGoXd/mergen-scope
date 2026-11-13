import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ExportDpi, ExportImageOptions, ExportSize, ExportTheme } from '../../../domain/export-image';
import { readAppPreferences } from '../../settings/app-preferences';
import { Btn } from '../../shared/Btn';
import { PopoverAt } from '../../shared/Controls';
import { readExportOptions, saveExportOptions } from './export-options-storage';
import '../pane-chrome.css';

const SIZES: readonly (readonly [ExportSize, string])[] = [['pane', 'Pane size'], ['ieee-1', '1 IEEE column (88.9 mm)'], ['ieee-2', '2 IEEE columns (181.9 mm)']];
const DPIS: readonly ExportDpi[] = [150, 300, 600];
const THEME_NAMES: Readonly<Record<ExportTheme, string>> = { print: 'Print white', dark: 'Dark', app: 'As app' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pset-row"><span className="pset-label t-label">{label}</span><div className="pset-controls" role="group" aria-label={label}>{children}</div></div>;
}

/** Size, dpi and theme for Copy image / Download image. Each change is saved at once (this browser only). */
export function ExportOptionsPopover({ paneName, at, onClose, onCopy, onDownload }: {
  paneName: string;
  at: HTMLElement | { x: number; y: number };
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const [options, setOptions] = useState<ExportImageOptions>(readExportOptions);
  const appTheme = readAppPreferences().exportTheme;
  const change = (patch: Partial<ExportImageOptions>) => { const next = { ...options, ...patch }; setOptions(next); saveExportOptions(next); };
  const choice = <T,>(value: T, current: T, label: string, set: (value: T) => void) =>
    <Btn key={String(value)} variant="slate" small active={value === current} aria-pressed={value === current} onClick={() => set(value)}>{label}</Btn>;
  return (
    <PopoverAt label="Image options" at={at} onClose={onClose}>
      <div className="pset" style={{ width: 360 }} data-testid="export-options">
        <div className="pset-title t-title">Image options · {paneName}</div>
        <section className="pset-section">
          <Row label="Size">{SIZES.map(([id, name]) => choice(id, options.size, name, size => change({ size })))}</Row>
          {options.size !== 'pane' && <Row label="dpi">{DPIS.map(dpi => choice(dpi, options.dpi, String(dpi), value => change({ dpi: value })))}</Row>}
          <Row label="Theme">
            {choice<ExportTheme | null>(null, options.theme, `App setting (${THEME_NAMES[appTheme]})`, theme => change({ theme }))}
            {(['print', 'dark', 'app'] as const).map(theme => choice<ExportTheme | null>(theme, options.theme, THEME_NAMES[theme], value => change({ theme: value })))}
          </Row>
          <div className="pset-note t-caption">{options.size === 'pane' ? 'Twice the pane size on screen.' : 'Paper sizes use 8 pt serif text and 0.75 pt lines.'}</div>
        </section>
        <div className="pset-actions" role="group" aria-label="Image actions">
          <Btn small onClick={onCopy}>Copy image</Btn>
          <Btn small onClick={onDownload}>Download image</Btn>
        </div>
      </div>
    </PopoverAt>
  );
}
