// SAMPLE DATA ONLY: a static demo of every state, for comparison with boards X1 / R1 / P4c.
// Callbacks are no-ops. Light on the left, dark on the right; Compact on top, Comfortable below.
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import {
  AddAnalysisMenu, AnalysisCard, AnalysisEmpty, AnalysisPanel, Busy, CardMsg, CrossingsList, KeyValues, OutputRow, Params, Result,
} from '../Analysis';
import type { AddMenuItem } from '../types';
import '../../common/app-tokens.css';
import '../analysis.css';

const noop = (): void => undefined;

const MENU: AddMenuItem[] = [
  { id: 'arith', kind: 'math', title: 'A ± B, A × B, A ÷ B', note: 'two traces → a trace' },
  { id: 'bw', kind: 'measure', title: 'Bandwidth', note: '3 dB / 10 dB width', added: true },
  { id: 'chp', kind: 'measure', title: 'Channel power', note: 'band power and density', disabledReason: 'needs a dBm/Hz trace' },
  { id: 'ip3', kind: 'measure', title: 'IP3 / TOI', note: 'two-tone intercept' },
  { id: 'obw', kind: 'measure', title: 'Occupied bandwidth', note: '99 % power width' },
  { id: 'peak', kind: 'measure', title: 'Peak table', note: 'peaks and spurs' },
  { id: 'rip', kind: 'measure', title: 'Ripple / flatness', note: 'peak-to-peak in a band', added: true },
  { id: 'smooth', kind: 'math', title: 'Smooth', note: 'moving avg, median, S-G', added: true },
  { id: 'thr', kind: 'measure', title: 'Threshold crossings', note: 'where a trace crosses a level' },
];

function Panel(): ReactElement {
  return (
    <AnalysisPanel count={5} onAdd={noop}>
      <AnalysisCard id="bw" kind="measure" title="Bandwidth" source="S21 · lna_board_rev3.s2p · Pane 1" onToggle={noop} onMenu={noop} onRemove={noop}>
        <KeyValues rows={[{ label: 'Level', value: '−3 dB from peak' }, { label: 'Range', value: 'visible' }]} />
        <Result value="86.2" unit="MHz" note="centre 2.441 GHz · 2.398 → 2.484 GHz" />
      </AnalysisCard>
      <AnalysisCard id="rip" kind="measure" title="Ripple / flatness" source="S21 · in 2.40–2.48 GHz" collapsed summary="0.42 dB p-p" onToggle={noop} onMenu={noop} onRemove={noop} />
      <AnalysisCard id="smooth" kind="math" title="Smooth" source="S21 · lna_board_rev3.s2p" selected onToggle={noop} onMenu={noop} onRemove={noop}>
        <Params fields={[
          { id: 'method', label: 'Method', control: { type: 'select', value: 'Savitzky–Golay', onOpen: noop } },
          { id: 'window', label: 'Window', control: { type: 'number', value: '7', unit: 'points', onCommit: noop } },
          { id: 'order', label: 'Order', control: { type: 'segmented', value: '2', onChange: noop, options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }] } },
        ]} />
        <OutputRow hue={337.5} name="smoothed · SG 7" panes={['P1']} live onLive={noop} />
      </AnalysisCard>
      <AnalysisCard id="noise" kind="measure" title="Noise density" source="S21 · lna_board_rev3.s2p" onToggle={noop} onMenu={noop} onRemove={noop}>
        <CardMsg tone="warning" text="Needs a power spectral density trace (dBm/Hz). S21 is in dB." action={{ label: 'Pick a trace', onClick: noop }} />
      </AnalysisCard>
      <AnalysisCard id="v1" kind="measure" title="V1 crossings" source="V1 · 3.653 32 GHz · P1, P2" onToggle={noop} onMenu={noop} onRemove={noop}>
        <Result value="3" unit="crossings" />
        <CrossingsList valueLabel="Y" onSelect={noop} onCopy={noop} groups={[
          { paneBadge: 'P1', paneTitle: 'Pane 1 · Chart', rows: [
            { id: 'a', hue: 270, trace: 'S11 · cascaded chain.s2p', value: '−9.198 dB', current: true },
            { id: 'b', hue: 0, trace: 'S21 · cascaded chain.s2p', value: '17.57 dB' },
          ] },
          { paneBadge: 'P2', paneTitle: 'Pane 2 · Chart', rows: [
            { id: 'c', hue: 90, trace: 'S21 · filter_v3.s2p', value: '−0.92 dB' },
          ] },
        ]} />
      </AnalysisCard>
    </AnalysisPanel>
  );
}

function Manual(): ReactElement {
  return (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--panel)', borderRadius: 8 }}>
      <AnalysisCard id="thr" kind="measure" title="Threshold crossings" source="S21 · lna_board_rev3.s2p · Pane 1" onToggle={noop} onMenu={noop} onRemove={noop}>
        <Params fields={[
          { id: 'trace', label: 'Trace', control: { type: 'select', value: 'S21 · lna_board_rev3.s2p', onOpen: noop } },
          { id: 'level', label: 'Level', control: { type: 'number', value: '−3', unit: 'dB', onCommit: noop } },
        ]} />
        <Result value="2" unit="crossings" />
        <CrossingsList valueLabel="X" onSelect={noop} onCopy={noop} groups={[{ paneBadge: 'P1', paneTitle: 'Pane 1', rows: [
          { id: 'x1', hue: 0, trace: 'S21 rising', value: '2.398 12 GHz' },
          { id: 'x2', hue: 0, trace: 'S21 falling', value: '2.484 40 GHz' },
        ] }]} />
      </AnalysisCard>
      <AnalysisCard id="ip3" kind="measure" title="IP3 / TOI" source="cascade_ip3_-12dBm_final.DAT" onToggle={noop} onRemove={noop}>
        <Params fields={[{ id: 'gain', label: 'Gain', control: { type: 'number', value: '12x', unit: 'dB', invalid: true, onCommit: noop } }]} />
        <CardMsg tone="danger" text="Gain must be a number, e.g. 12 or 12.5." />
        <Busy text="Waiting for a valid gain…" />
      </AnalysisCard>
    </div>
  );
}

function Theme({ dark, comfortable }: { dark: boolean; comfortable: boolean }): ReactElement {
  return (
    <div className={`${dark ? 'theme-dark' : 'theme-light'}${comfortable ? ' density-comfortable' : ''}`}
      style={{ display: 'flex', gap: 20, padding: 16, background: 'var(--bg)', color: 'var(--text)', alignItems: 'flex-start', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: 320, height: comfortable ? 1010 : 900, display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}><Panel /></div>
      <Manual />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AddAnalysisMenu query="" filter="all" items={MENU} activeId="bw" onQuery={noop} onFilter={noop} onPick={noop}
          recent={[MENU[1]!, MENU[7]!]} />
        <div style={{ width: 320, height: 150, display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
          <AnalysisPanel count={0} onAdd={noop} empty={<AnalysisEmpty onAdd={noop} />} />
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(
  <div>
    <div style={{ display: 'flex' }}><Theme dark={false} comfortable={false} /><Theme dark comfortable={false} /></div>
    <div style={{ display: 'flex' }}><Theme dark={false} comfortable /><Theme dark comfortable /></div>
  </div>,
);
