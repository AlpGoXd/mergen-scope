// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { useFileDispatch } from '../../src/stores/file-store';
import { useTraceState } from '../../src/stores/trace-store';
import { usePaneDispatch } from '../../src/stores/pane-store';
import { useMarkerDispatch } from '../../src/stores/marker-store';
import { parseMeasurementFile } from '../../src/domain/parsers/parse-file';
import { buildNetworkProjectionDisplayTrace } from '../../src/domain/dataset-builders';
import { ExportImageProvider } from '../../src/components/chart/export/ExportImageProvider';
import { usePaneImageExport } from '../../src/components/chart/export/export-context';
import { ChartPane } from '../../src/components/chart/ChartPane';
import { SmithPaneContainer } from '../../src/components/smith/SmithPaneContainer';
import { PolarPane } from '../../src/components/panes/PolarPane';
import { DEFAULT_DOCUMENT_OPTIONS } from '../../src/domain/export-document';
import type { ExportView } from '../../src/components/chart/export/export-context';
import type { PaneRenderMode } from '../../src/types/pane';

HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const SAMPLE_S2P = [
  '# GHz S RI R 50',
  '1.0 -0.3 0.1 0.8 -0.1 0.8 -0.1 -0.2 0.1',
  '2.0  0.1 0.2 0.7 -0.2 0.7 -0.2  0.1 0.2',
  '3.0  0.4 -0.2 0.6 -0.3 0.6 -0.3 0.3 -0.1',
].join('\n');

function useSeedPane(mode: PaneRenderMode, showMarkerLabels = true) {
  const fileDispatch = useFileDispatch();
  const { allTraces } = useTraceState();
  const paneDispatch = usePaneDispatch();
  const markerDispatch = useMarkerDispatch();
  const seededFile = React.useRef(false);
  const seededPane = React.useRef(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (seededFile.current) return;
    seededFile.current = true;
    const parsed = parseMeasurementFile(SAMPLE_S2P, 'board.s2p');
    const dataset = parsed.datasets?.find(d => d.family === 'network');
    if (!dataset || dataset.family !== 'network') throw new Error('missing network dataset');
    const display = buildNetworkProjectionDisplayTrace(dataset, { row: 0, col: 0, component: 'magnitude-db', label: 'S11' });
    fileDispatch({ type: 'ADD_PARSED_FILE', payload: { id: 'f1', fileName: 'board.s2p', text: SAMPLE_S2P, parsed: { ...parsed, displayTraces: [display] } } });
  }, [fileDispatch]);

  React.useEffect(() => {
    const trace = allTraces[0];
    if (!trace || seededPane.current) return;
    seededPane.current = true;
    if (mode !== 'cartesian') {
      paneDispatch({ type: 'SET_RENDER_MODE', payload: { paneId: 'pane-1', mode, confirmed: true } });
    }
    if (!showMarkerLabels) {
      paneDispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId: 'pane-1', patch: { showMarkerLabels: false } } });
    }
    paneDispatch({ type: 'ASSIGN_TRACE_TO_PANE', payload: { trace, targetPaneId: 'pane-1', allTraces } });
    markerDispatch({ type: 'PLACE_MARKER', payload: { trace, targetFreq: 2e9 } });
    setReady(true);
  }, [allTraces, paneDispatch, markerDispatch, mode, showMarkerLabels]);

  return ready;
}

function exportViewFor(markerTags: boolean, paper: boolean): ExportView {
  return {
    width: 500,
    height: 300,
    colorTheme: 'light',
    print: true,
    paper,
    paperTone: paper,
    markScale: 1,
    tagPx: 11,
    appearance: {
      ...DEFAULT_DOCUMENT_OPTIONS,
      include: { ...DEFAULT_DOCUMENT_OPTIONS.include, markerTags },
    },
  };
}

describe('export marker tags visibility across panes', () => {
  it('ChartPane keeps marker symbol and hides pill/leader/text when markerTags is false (screen and paper)', async () => {
    function Harness({ markerTags, paper }: { markerTags: boolean; paper: boolean }) {
      const ready = useSeedPane('cartesian');
      return ready ? <ChartPane paneId="pane-1" exportView={exportViewFor(markerTags, paper)} /> : null;
    }

    const onScreen = render(<StoreRoot><Harness markerTags={true} paper={false} /></StoreRoot>);
    await waitFor(() => expect(onScreen.container.querySelector('.recharts-reference-dot')).not.toBeNull());
    const dotOn = onScreen.container.querySelector('.recharts-reference-dot');
    expect(dotOn?.querySelectorAll('circle').length).toBe(2);
    expect(dotOn?.querySelectorAll('rect').length).toBe(1);
    expect(dotOn?.querySelectorAll('line').length).toBe(1);
    expect(dotOn?.querySelectorAll('text').length).toBe(1);
    onScreen.unmount();

    const offScreen = render(<StoreRoot><Harness markerTags={false} paper={false} /></StoreRoot>);
    await waitFor(() => expect(offScreen.container.querySelector('.recharts-reference-dot')).not.toBeNull());
    const dotOff = offScreen.container.querySelector('.recharts-reference-dot');
    expect(dotOff?.querySelectorAll('circle').length).toBe(2);
    expect(dotOff?.querySelectorAll('rect').length).toBe(0);
    expect(dotOff?.querySelectorAll('line').length).toBe(0);
    expect(dotOff?.querySelectorAll('text').length).toBe(0);
    offScreen.unmount();

    const onPaper = render(<StoreRoot><Harness markerTags={true} paper={true} /></StoreRoot>);
    await waitFor(() => expect(onPaper.container.querySelector('.recharts-reference-dot')).not.toBeNull());
    const dotOnPaper = onPaper.container.querySelector('.recharts-reference-dot');
    expect(dotOnPaper?.querySelectorAll('circle').length).toBe(2);
    expect(dotOnPaper?.querySelectorAll('[data-paper-marker-leader]').length).toBe(1);
    expect(dotOnPaper?.querySelectorAll('[data-paper-marker-label]').length).toBe(1);
    onPaper.unmount();

    const offPaper = render(<StoreRoot><Harness markerTags={false} paper={true} /></StoreRoot>);
    await waitFor(() => expect(offPaper.container.querySelector('.recharts-reference-dot')).not.toBeNull());
    const dotOffPaper = offPaper.container.querySelector('.recharts-reference-dot');
    expect(dotOffPaper?.querySelectorAll('circle').length).toBe(2);
    expect(dotOffPaper?.querySelectorAll('rect').length).toBe(0);
    expect(dotOffPaper?.querySelectorAll('line').length).toBe(0);
    expect(dotOffPaper?.querySelectorAll('text').length).toBe(0);
    offPaper.unmount();
  });

  it('SmithPaneContainer keeps marker glyph and hides tag/leader/text when markerTags is false (screen and paper)', async () => {
    function Harness({ markerTags, paper }: { markerTags: boolean; paper: boolean }) {
      const ready = useSeedPane('smith');
      return ready ? <SmithPaneContainer paneId="pane-1" exportView={exportViewFor(markerTags, paper)} /> : null;
    }

    const onScreen = render(<StoreRoot><Harness markerTags={true} paper={false} /></StoreRoot>);
    await waitFor(() => expect(onScreen.container.querySelector('.smith-marker')).not.toBeNull());
    const mOn = onScreen.container.querySelector('.smith-marker');
    expect(mOn?.querySelectorAll('.smith-marker-glyph').length).toBe(1);
    expect(mOn?.querySelectorAll('.smith-tag').length).toBe(1);
    expect(mOn?.querySelectorAll('.smith-tag-text').length).toBe(1);
    onScreen.unmount();

    const offScreen = render(<StoreRoot><Harness markerTags={false} paper={false} /></StoreRoot>);
    await waitFor(() => expect(offScreen.container.querySelector('.smith-marker')).not.toBeNull());
    const mOff = offScreen.container.querySelector('.smith-marker');
    expect(mOff?.querySelectorAll('.smith-marker-glyph').length).toBe(1);
    expect(mOff?.querySelectorAll('.smith-tag').length).toBe(0);
    expect(mOff?.querySelectorAll('.smith-tag-text').length).toBe(0);
    expect(mOff?.querySelectorAll('line').length).toBe(0);
    expect(mOff?.querySelectorAll('text').length).toBe(0);
    offScreen.unmount();

    const offPaper = render(<StoreRoot><Harness markerTags={false} paper={true} /></StoreRoot>);
    await waitFor(() => expect(offPaper.container.querySelector('.smith-marker')).not.toBeNull());
    const mOffPaper = offPaper.container.querySelector('.smith-marker');
    expect(mOffPaper?.querySelectorAll('.smith-marker-glyph').length).toBe(1);
    expect(mOffPaper?.querySelectorAll('[data-paper-marker-leader]').length).toBe(0);
    expect(mOffPaper?.querySelectorAll('[data-paper-marker-label]').length).toBe(0);
    expect(mOffPaper?.querySelectorAll('text').length).toBe(0);
    offPaper.unmount();
  });

  it('PolarPane keeps marker circle and hides tag pill/text when markerTags is false', async () => {
    function Harness({ markerTags }: { markerTags: boolean }) {
      const ready = useSeedPane('polar');
      return ready ? <PolarPane paneId="pane-1" exportView={exportViewFor(markerTags, false)} /> : null;
    }

    const on = render(<StoreRoot><Harness markerTags={true} /></StoreRoot>);
    await waitFor(() => expect(on.container.querySelector('.polar-marker')).not.toBeNull());
    const mOn = on.container.querySelector('.polar-marker');
    expect(mOn?.querySelectorAll('circle').length).toBe(1);
    expect(mOn?.querySelectorAll('rect').length).toBe(1);
    expect(mOn?.querySelectorAll('.polar-tag').length).toBe(1);
    on.unmount();

    const off = render(<StoreRoot><Harness markerTags={false} /></StoreRoot>);
    await waitFor(() => expect(off.container.querySelector('.polar-marker')).not.toBeNull());
    const mOff = off.container.querySelector('.polar-marker');
    expect(mOff?.querySelectorAll('circle').length).toBe(1);
    expect(mOff?.querySelectorAll('rect').length).toBe(0);
    expect(mOff?.querySelectorAll('.polar-tag').length).toBe(0);
    expect(mOff?.querySelectorAll('text').length).toBe(0);
    off.unmount();
  });

  it('ExportDocumentDialog + ExportImageProvider removes marker tags from SVG and keeps marker symbols', async () => {
    const origBcr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { x: 0, y: 0, width: 500, height: 300, top: 0, left: 0, right: 500, bottom: 300, toJSON() {} };
    };
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    let seq = 0;
    URL.createObjectURL = () => `blob:test-${++seq}`;
    URL.revokeObjectURL = () => {};
    window.__mergenLastExportSvg = undefined;

    try {
      function Trigger() {
        const ready = useSeedPane('cartesian');
        const exp = usePaneImageExport();
        React.useEffect(() => {
          if (ready) exp?.openDialog('pane-1');
        }, [ready, exp]);
        return null;
      }

      const { getByLabelText } = render(
        <StoreRoot>
          <ExportImageProvider>
            <Trigger />
          </ExportImageProvider>
        </StoreRoot>,
      );

      await waitFor(() => expect(window.__mergenLastExportSvg).toBeTruthy(), { timeout: 4000 });
      const svgWithTags = window.__mergenLastExportSvg ?? '';
      expect(svgWithTags).toContain('M1 ');

      const checkbox = getByLabelText('Marker tags') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(false);

      await waitFor(() => expect(window.__mergenLastExportSvg).not.toBe(svgWithTags), { timeout: 4000 });
      const svgWithoutTags = window.__mergenLastExportSvg ?? '';
      expect(svgWithoutTags).not.toContain('M1 ');
      expect(svgWithoutTags).toContain('recharts-reference-dot');
    } finally {
      Element.prototype.getBoundingClientRect = origBcr;
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });

  it('ExportImageProvider quick LaTeX export respects pane showMarkerLabels while keeping marker symbols', async () => {
    const origBcr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { x: 0, y: 0, width: 500, height: 300, top: 0, left: 0, right: 500, bottom: 300, toJSON() {} };
    };
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:test-tex';
    URL.revokeObjectURL = () => {};
    window.__mergenLastExportLatex = undefined;

    try {
      function Trigger() {
        const ready = useSeedPane('cartesian', false);
        const exp = usePaneImageExport();
        React.useEffect(() => {
          if (ready) exp?.downloadLatex('pane-1');
        }, [ready, exp]);
        return null;
      }

      render(
        <StoreRoot>
          <ExportImageProvider>
            <Trigger />
          </ExportImageProvider>
        </StoreRoot>,
      );

      await waitFor(() => expect(window.__mergenLastExportLatex).toBeTruthy(), { timeout: 4000 });
      const tex = window.__mergenLastExportLatex ?? '';
      expect(tex).toContain('\\node[circle, fill=msTrace');
      expect(tex).not.toContain('pin=');
      expect(tex).not.toContain('msTag');
      expect(tex).not.toMatch(/\{M1\b/);
    } finally {
      Element.prototype.getBoundingClientRect = origBcr;
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});
