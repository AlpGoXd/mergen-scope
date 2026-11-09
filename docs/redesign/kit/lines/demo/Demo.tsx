// SAMPLE DATA ONLY: a static demo of every state in board P4c, for visual comparison.
// Callbacks are no-ops. Light on the left, dark on the right.
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import { ChartLine, CrossingDot, EdgeTag, LineRow, lineContextEntries, lineShowInEntries } from '../Lines';
import { Menu } from './vendor/Menu';
import '../../common/app-tokens.css';
import './vendor/left-panel.css';
import '../lines.css';

const noop = (): void => undefined;
const W = 330, H = 170, PLOT = { left: 34, top: 8, width: 286, height: 136 };

function curve(phase: number, amp = 0.32): string {
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const x = PLOT.left + (PLOT.width * i) / 80;
    const y = PLOT.top + PLOT.height * (0.5 + amp * Math.sin(i / 9 + phase));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function Pane({ title, range, hue, phase, children, overlay }: { title: string; range: [string, string]; hue: number; phase: number; children?: ReactElement | ReactElement[]; overlay?: ReactElement }): ReactElement {
  return (
    <div style={{ width: W, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--raised)', overflow: 'hidden', fontFamily: 'var(--font-sans)' }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text)' }}>
        <b>{title}</b><span style={{ color: 'var(--text-muted)' }}>{range[0]}–{range[1]} GHz</span>
      </div>
      <div style={{ position: 'relative', height: H }}>
        <svg width={W} height={H} aria-hidden="true">
          <rect x={PLOT.left} y={PLOT.top} width={PLOT.width} height={PLOT.height} fill="none" stroke="var(--border)" />
          {[1, 2, 3].map((i) => <line key={i} x1={PLOT.left + (PLOT.width * i) / 4} y1={PLOT.top} x2={PLOT.left + (PLOT.width * i) / 4} y2={PLOT.top + PLOT.height} stroke="var(--border)" strokeDasharray="3 3" />)}
          <polyline points={curve(phase)} fill="none" stroke={`oklch(0.58 0.16 ${hue})`} strokeWidth={1.5} />
          <text x={PLOT.left} y={H - 8} fontSize={9} fill="var(--text-muted)" style={{ fontFamily: 'var(--font-mono)' }}>{range[0]}</text>
          <text x={PLOT.left + PLOT.width} y={H - 8} fontSize={9} fill="var(--text-muted)" textAnchor="end" style={{ fontFamily: 'var(--font-mono)' }}>{range[1]}</text>
          {children}
        </svg>
        {overlay}
      </div>
    </div>
  );
}

function Rows(): ReactElement {
  return (
    <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 4, padding: 8, background: 'var(--panel)', borderRadius: 8 }}>
      <LineRow label="V1" kind="v" value="2.400 00 GHz" panes={['P1']} crossings="2 crossings" onValue={noop} onPanes={noop} onListCrossings={noop} onRemove={noop} />
      <LineRow label="V1" kind="v" value="2.400 00 GHz" panes={['P1', 'P2']} crossings="3 crossings" lit menuOpen onValue={noop} onPanes={noop} onListCrossings={noop} onRemove={noop} />
      <LineRow label="V2" kind="v" value="2.400 00 GHz" panes={['P1', 'P2']} offView={['P1']} crossings="1 crossing" onValue={noop} onPanes={noop} onListCrossings={noop} onRemove={noop} />
      <LineRow label="H1" kind="h" value="−3.00 dB" panes={['P1']} crossings="2 crossings" onValue={noop} onPanes={noop} onListCrossings={noop} onRemove={noop} />
      <LineRow label="V3" kind="v" value="1.200 00 GHz" panes={[]} onValue={noop} onPanes={noop} onListCrossings={noop} onRemove={noop} />
      <LineRow label="V4" kind="v" value="2.4x GHz" panes={['P2']} invalid onValue={noop} onPanes={noop} onListCrossings={noop} onRemove={noop} />
    </div>
  );
}

function Theme({ dark }: { dark: boolean }): ReactElement {
  const x24 = PLOT.left + PLOT.width * 0.4;
  return (
    <div className={dark ? 'theme-dark' : 'theme-light'} style={{ display: 'flex', gap: 16, padding: 16, background: 'var(--bg)', color: 'var(--text)', alignItems: 'flex-start' }}>
      <Rows />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Pane title="Pane 1" range={['2.00', '3.00']} hue={270} phase={0.4}>
          <ChartLine kind="v" at={x24} plot={PLOT} label="V1" paneCount={2} lit />
          <CrossingDot x={x24} y={PLOT.top + PLOT.height * (0.5 + 0.32 * Math.sin(32 / 9 + 0.4))} hue={270} current />
          <ChartLine kind="h" at={PLOT.top + PLOT.height * 0.25} plot={PLOT} label="H1" paneCount={1} />
        </Pane>
        <Pane title="Pane 2" range={['2.20', '2.80']} hue={25} phase={1.6}>
          <ChartLine kind="v" at={PLOT.left + PLOT.width / 3} plot={PLOT} label="V1" paneCount={2} lit />
          <CrossingDot x={PLOT.left + PLOT.width / 3} y={PLOT.top + PLOT.height * (0.5 + 0.32 * Math.sin(80 / 3 / 9 + 1.6))} hue={25} />
        </Pane>
        <Pane title="Pane 3" range={['1.00', '2.00']} hue={150} phase={2.4}
          overlay={<EdgeTag side="right" offset={H / 2} label="V2" value="2.400 GHz" onReveal={noop} />} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Menu label="Show in" title="Show in" checklist entries={lineShowInEntries([
          { id: 'p1', label: 'Pane 1 · Chart', checked: true },
          { id: 'p2', label: 'Pane 2 · Chart', checked: true },
          { id: 'p3', label: 'Pane 3 · Chart (time)', checked: false, aside: 's ≠ Hz', disabledReason: 'Pane 3 shows time (s); V1 is in Hz' },
          { id: 'p4', label: 'Pane 4 · Table', checked: false, aside: 'no X axis', disabledReason: 'Tables have no X axis to place a line on' },
        ], noop)} />
        <Menu label="V1 actions" entries={lineContextEntries({ label: 'V1', kind: 'v', paneName: 'Pane 1', onShowIn: noop, onEdit: noop, onListCrossings: noop, onRemoveHere: noop, onDelete: noop })} />
        <Menu label="H1 actions" entries={lineContextEntries({ label: 'H1', kind: 'h', paneName: 'Pane 1', onShowIn: noop, onEdit: noop, onListCrossings: noop, onRemoveHere: noop, onDelete: noop })} />
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<div style={{ display: 'flex' }}><Theme dark={false} /><Theme dark /></div>);
