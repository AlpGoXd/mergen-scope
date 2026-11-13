// SAMPLE DATA ONLY: a static demo of every state, for visual comparison with the reference images.
// Nothing here is app logic; callbacks are no-ops.
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import { DropZone, EMPTY_TEXT, LeftPanel, OpenButton, Section } from '../LeftPanel';
import { FileRow } from '../FileRow';
import { LineRow, MarkerItem, TraceColumnsHeader, TraceRow } from '../Rows';
import { INTERP_ENTRIES, Menu, fileMenuEntries } from '../Menu';
import type { MatrixProps } from '../types';
import '../tokens.css';
import '../left-panel.css';

const noop = (): void => undefined;

const s2pMatrix: MatrixProps = {
  ports: 2, family: 'S', view: 'dB', abcdAllowed: true,
  cells: [
    { row: 1, col: 1, plotted: { hue: 270 }, title: 'S11 · dB · plotted in Pane 1' },
    { row: 2, col: 1, plotted: { hue: 0 }, title: 'S21 · dB · plotted in Pane 1' },
    { row: 1, col: 2, title: 'S12 · dB · click to add to Pane 1 (target)' },
    { row: 2, col: 2, title: 'S22 · dB · click to add to Pane 1 (target)' },
  ],
  moreViews: [{ view: 'VSWR', allowed: true }, { view: 'Return loss', allowed: true }, { view: 'Group delay', allowed: true }],
  onFamily: noop, onView: noop, onMore: noop, onToggleCell: noop,
};

function Panel(): ReactElement {
  return (
    <LeftPanel>
      <Section title="Files" count={4} collapsed={false} onToggle={noop} onMenu={noop} emptyText={EMPTY_TEXT.files} action={<OpenButton onOpen={noop} />}>
        <FileRow format="S2P" name="lna_board_rev3.s2p" title="lna_board_rev3.s2p · 2 ports · 401 pts · 0.5–6 GHz" state="ready"
          summary="2 ports · 401 pts · 0.5–6 GHz · 3 traces" matrix={{ open: true, onToggle: noop, props: s2pMatrix }} onMenu={noop} menuOpen onRemove={noop} />
        <FileRow format="S2P" name="filter_v3.s2p" title="filter_v3.s2p" state="ready"
          matrix={{ open: false, onToggle: noop, props: s2pMatrix }} onMenu={noop} onRemove={noop} />
        <FileRow format="DAT" name="cascade_ip3…final.DAT" title="cascade_ip3_-12dBm_final.DAT" state="traceRemoved" onPlot={noop} onMenu={noop} onRemove={noop} />
        <FileRow format="CSV" name="scope_capture_04.csv" title="scope_capture_04.csv" state="ready"
          columns={{ open: true, onToggle: noop, items: [
            { name: 'CH1 (V)', plotted: true, onToggle: noop }, { name: 'CH2 (V)', plotted: true, onToggle: noop }, { name: 'CH3 (V)', plotted: false, onToggle: noop }] }}
          onMenu={noop} onRemove={noop} />
        <FileRow format="S8P" name="switch_matrix.s8p" title="switch_matrix.s8p" state="parsing" progressPct={62} onMenu={noop} onRemove={noop} />
        <FileRow format="CSV" name="scope_capture_05.csv" title="" state="error" errorReason="No numeric columns found" onFix={noop} onMenu={noop} onRemove={noop} />
      </Section>
      <Section title="Traces" count={6} collapsed={false} onToggle={noop} onMenu={noop} emptyText={EMPTY_TEXT.traces}>
        <TraceColumnsHeader />
        <TraceRow hue={270} name="lna_board_rev3.s2p" subline="S11 · dB" interp="Lin" panes={['P1', 'P2']} visible onVisible={noop} onSelect={noop} onInterp={noop} onPanes={noop} onRename={noop} onRemove={noop} />
        <TraceRow hue={0} name="lna_board_rev3.s2p" subline="S21 · dB" interp="Lin" panes={['P1']} visible selected onVisible={noop} onSelect={noop} onInterp={noop} onPanes={noop} onRename={noop} onRemove={noop} />
        <TraceRow hue={337.5} name="smoothed · SG 7" interp="Lin" panes={['P1']} visible created child onVisible={noop} onSelect={noop} onInterp={noop} onPanes={noop} onRename={noop} onRemove={noop} />
        <TraceRow hue={90} name="filter_v3.s2p" subline="S11 · dB" interp="Lin" panes={['P2']} visible={false} onVisible={noop} onSelect={noop} onInterp={noop} onPanes={noop} onRename={noop} onRemove={noop} />
        <TraceRow hue={180} name="scope_capture_04.csv" subline="CH1 (V)" interp="Auto" panes={['P3']} visible onVisible={noop} onSelect={noop} onInterp={noop} onPanes={noop} onRename={noop} onRemove={noop} />
        <TraceRow hue={315} name="scope_capture_04.csv" subline="CH2 (V)" interp="Lin" panes={[]} visible onVisible={noop} onSelect={noop} onInterp={noop} onPanes={noop} onRename={noop} onRemove={noop} />
      </Section>
      <Section title="Markers" count={2} collapsed={false} onToggle={noop} onMenu={noop} emptyText={EMPTY_TEXT.markers}>
        <MarkerItem label="M1" hue={0} x="2.437 00 GHz" y="−1.82 dB" traceName="lna_board_rev3.s2p · S21" panes={['P1']} mode="snap" selected onX={noop} onSelect={noop} onRemove={noop} />
        <MarkerItem label="D2" hue={0} x="+12.00 MHz" y="−3.01 dB" traceName="" panes={['P1']} mode="snap"
          delta={{ from: 'M1', fromHue: 0, at: '2.449 00 GHz', onChangeRef: noop }} onX={noop} onSelect={noop} onRemove={noop} />
      </Section>
      <Section title="Lines" count={2} collapsed={false} onToggle={noop} onMenu={noop} emptyText={EMPTY_TEXT.lines}>
        <LineRow label="V1" value="2.400 00 GHz" summary="P1 + P2 (linked, Hz) · 4 crossings" link="on" onValue={noop} onLink={noop} onListCrossings={noop} onRemove={noop} />
        <LineRow label="H1" value="−3.00 dB" summary="P1 · 2 crossings" link="na" onValue={noop} onLink={noop} onListCrossings={noop} onRemove={noop} />
      </Section>
    </LeftPanel>
  );
}

function Menus(): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      <Menu label="File actions" entries={fileMenuEntries({ isCsv: true, multiTrace: true, onInfo: noop, onReplace: noop, onEditColumns: noop, onRename: noop, onShowAll: noop, onRemove: noop })} />
      <Menu label="Interpolation" title="Interpolation" checklist style={{ width: 250 }}
        entries={INTERP_ENTRIES.map((e) => ({ label: e.label, note: e.note, noteBelow: true, checked: e.value === 'Lin' }))}
        footer={<button type="button" className="lp-link">Apply to all traces from this file</button>} />
      <Menu label="Show in" title="Show in" checklist
        entries={[{ label: 'Pane 1 · Chart', checked: true }, { label: 'Pane 2 · Smith', checked: true }, { label: 'Pane 3 · Chart (time)', aside: 'Hz ≠ s', disabledReason: 'Pane 3 shows time traces' }, { label: 'New pane' }]} />
    </div>
  );
}

function Theme({ dark }: { dark: boolean }): ReactElement {
  return (
    <div className={dark ? 'theme-dark' : 'theme-light'} style={{ display: 'flex', gap: 24, padding: 16, background: 'var(--bg)', alignItems: 'flex-start' }}>
      <div style={{ height: 1180, display: 'flex' }}><Panel /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Menus />
        <div style={{ height: 330, display: 'flex', borderRadius: 8, overflow: 'hidden' }}>
          <LeftPanel>
            <Section title="Files" count={1} collapsed={false} onToggle={noop} onMenu={noop} emptyText={EMPTY_TEXT.files}>
              <DropZone onOpen={noop} onDemo={noop} />
            </Section>
          </LeftPanel>
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<div style={{ display: 'flex' }}><Theme dark={false} /><Theme dark /></div>);
