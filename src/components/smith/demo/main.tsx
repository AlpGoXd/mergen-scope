import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import '../../../text-roles.css';
import type { Marker } from '../../../types/marker';
import { gammaAtFrequency } from '../../../domain/smith/hit';
import type { SmithLabelMode } from '../../../domain/smith/labels';
import type { SmithDirectionMode } from '../../../domain/smith/trace-decor';
import { SmithPane } from '../SmithPane';
import type { SmithGridMode, SmithPaneTrace } from '../SmithPane';
import { LNA_F0_HZ, LNA_Z0, lnaS11, lnaS22, sweep } from './lna-model';

/**
 * Dev-only demo: /src/components/smith/demo/index.html
 * URL options (used by the screenshot script): theme=light|dark, size=compact|comfortable|large,
 * grid=z|y|both, labels=normalised|ohms|off, direction=chevrons|ends|off, band=1, active=1, w, h.
 */
const query = new URLSearchParams(location.search);
const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const value = query.get(key);
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
};

const BAND = { minHz: 2.0e9, maxHz: 3.0e9 };

function Demo() {
  const [theme, setTheme] = useState(pick('theme', ['light', 'dark'] as const, 'light'));
  const [size, setSize] = useState(pick('size', ['compact', 'comfortable', 'large'] as const, 'comfortable'));
  const [grid, setGrid] = useState<SmithGridMode>(pick('grid', ['z', 'y', 'both'] as const, 'z'));
  const [labels, setLabels] = useState<SmithLabelMode | 'off'>(pick('labels', ['normalised', 'ohms', 'off'] as const, 'normalised'));
  const [direction, setDirection] = useState<SmithDirectionMode>(pick('direction', ['chevrons', 'ends', 'off'] as const, 'chevrons'));
  const [band, setBand] = useState(query.get('band') === '1');
  const [active, setActive] = useState(query.get('active') === '1');
  const [cursorHz, setCursorHz] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light');
    document.documentElement.classList.add(`theme-${theme}`);
    document.documentElement.dataset.size = size;
  }, [theme, size]);

  const traces = useMemo<SmithPaneTrace[]>(() => {
    const list: SmithPaneTrace[] = [
      { traceId: 's11', name: 'lna_board_rev3.s2p · S11', shortName: 'S11', color: 'var(--tr0)', z0: LNA_Z0, samples: sweep(lnaS11) },
      { traceId: 's22', name: 'lna_board_rev3.s2p · S22', shortName: 'S22', color: 'var(--tr1)', z0: LNA_Z0, samples: sweep(lnaS22) },
    ];
    if (active) {
      list.push({
        traceId: 'osc', name: 'S11 · active', shortName: 'ƒ S11', color: 'var(--tr2)', created: true, z0: LNA_Z0,
        samples: sweep(lnaS11).map(sample => ({ frequencyHz: sample.frequencyHz, gamma: { re: sample.gamma.re * 1.3, im: sample.gamma.im * 1.3 } })),
      });
    }
    return list;
  }, [active]);

  const [markers, setMarkers] = useState<Marker[]>(() => [
    { id: 'm1', freq: LNA_F0_HZ, amp: 0, trace: 'lna_board_rev3.s2p · S11', type: 'normal', label: null, refId: null, interpolated: false },
    { id: 'm2', freq: 4.0e9, amp: 0, trace: 'lna_board_rev3.s2p · S22', type: 'normal', label: null, refId: null, interpolated: false },
  ]);
  const [selected, setSelected] = useState<string | null>(query.get('select') ?? 'm1');

  const button = (label: string, on: boolean, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={on} onClick={onClick}
      style={{ font: 'inherit', padding: '2px 8px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border-strong)', background: on ? 'var(--slate-fill)' : 'var(--raised)', color: on ? 'var(--slate-ink)' : 'var(--text)', cursor: 'pointer' }}>
      {label}
    </button>
  );
  const w = Number(query.get('w')) || 0, h = Number(query.get('h')) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {query.get('bare') !== '1' && (
        <div className="t-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 8, borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
          <span className="t-card-title">Smith pane demo</span>
          {(['light', 'dark'] as const).map(value => button(value, theme === value, () => setTheme(value)))}
          <span className="t-caption">size</span>
          {(['compact', 'comfortable', 'large'] as const).map(value => button(value, size === value, () => setSize(value)))}
          <span className="t-caption">grid</span>
          {(['z', 'y', 'both'] as const).map(value => button(value, grid === value, () => setGrid(value)))}
          <span className="t-caption">labels</span>
          {(['normalised', 'ohms', 'off'] as const).map(value => button(value, labels === value, () => setLabels(value)))}
          <span className="t-caption">direction</span>
          {(['chevrons', 'ends', 'off'] as const).map(value => button(value, direction === value, () => setDirection(value)))}
          {button('band 2–3 GHz', band, () => setBand(value => !value))}
          {button('active port', active, () => setActive(value => !value))}
          <span className="t-caption">hover: {cursorHz === null ? '—' : `${(cursorHz / 1e9).toFixed(4)} GHz`}</span>
        </div>
      )}
      <div style={{ display: 'flex', flex: w && h ? 'none' : 1, minHeight: 0, width: w || undefined, height: h || undefined, border: w && h ? '1px solid var(--border)' : undefined }}>
        <SmithPane
          traces={traces}
          markers={markers}
          selectedMarkerId={selected}
          onSelectMarker={setSelected}
          onTraceClick={click => {
            const trace = traces.find(candidate => candidate.traceId === click.traceId);
            if (!trace || !gammaAtFrequency(trace.samples, click.sampleFrequencyHz)) return;
            const id = `m${Date.now()}`;
            setMarkers(list => [...list, { id, freq: click.sampleFrequencyHz, amp: 0, trace: trace.name, type: 'normal', label: null, refId: null, interpolated: false }]);
            setSelected(id);
          }}
          band={band ? BAND : null}
          grid={grid}
          labels={labels}
          direction={direction}
          readout={grid === 'y' ? ['y', 'gamma', 'return-loss', 'vswr'] : ['z', 'gamma', 'return-loss', 'vswr']}
          onHoverFrequency={setCursorHz}
        />
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Demo /></StrictMode>);
