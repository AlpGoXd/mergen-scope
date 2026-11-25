// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartPane } from '../../src/components/chart/ChartPane';
import { PaneSettingsPopover } from '../../src/components/chart/PaneSettingsPopover';
import { SymbolsLayer } from '../../src/components/chart/SymbolsLayer';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { useFileDispatch } from '../../src/stores/file-store';
import { usePaneDispatch } from '../../src/stores/pane-store';
import { useTraceDispatch, useTraceState } from '../../src/stores/trace-store';
import { defaultPaneSettings } from '../../src/types/pane';
import type { Trace } from '../../src/types/trace';
import { makeTestTrace } from './helpers';

const ENVELOPE_SAMPLES_TITLE = 'This trace is a display envelope, not measured samples. Re-import with Keep all to see samples.';

function linearScale(domain: readonly [number, number], range: readonly [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const fn = ((value: number) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0)) as ((value: number) => number) & { domain: () => unknown[] };
  fn.domain = () => [d0, d1];
  return fn;
}

function PaneFixture({
  traces,
  typedEmpty = false,
  onReady,
}: {
  traces: readonly Trace[];
  typedEmpty?: boolean;
  onReady?: (actions: { hideTrace: (name: string) => void; showTrace: (name: string) => void }) => void;
}) {
  const fileDispatch = useFileDispatch();
  const paneDispatch = usePaneDispatch();
  const traceDispatch = useTraceDispatch();
  const { allTraces } = useTraceState();

  useEffect(() => {
    if (typedEmpty) {
      paneDispatch({ type: 'SET_RENDER_MODE', payload: { paneId: 'pane-1', mode: 'cartesian' } });
      return;
    }
    if (traces.length > 0) {
      fileDispatch({
        type: 'ADD_PARSED_FILE',
        payload: {
          id: 'file-1',
          fileName: 'fixture.bin',
          text: '',
          parsed: { format: 'rs-dat', meta: {}, traces: [...traces] },
        },
      });
    }
  }, [fileDispatch, paneDispatch, traces, typedEmpty]);

  useEffect(() => {
    if (traces.length === 0 || allTraces.length !== traces.length) return;
    for (const trace of allTraces) {
      paneDispatch({ type: 'ADD_MEMBERSHIP', payload: { trace, targetPaneId: 'pane-1', allTraces } });
    }
  }, [allTraces, paneDispatch, traces.length]);

  useEffect(() => {
    onReady?.({
      hideTrace: (name: string) => traceDispatch({ type: 'SET_VISIBILITY', name, visible: false }),
      showTrace: (name: string) => traceDispatch({ type: 'SET_VISIBILITY', name, visible: true }),
    });
  }, [onReady, traceDispatch]);

  return <ChartPane paneId="pane-1" />;
}

function SymbolsFixture({ traces }: { traces: readonly Trace[] }) {
  const fileDispatch = useFileDispatch();
  const { allTraces } = useTraceState();

  useEffect(() => {
    fileDispatch({
      type: 'ADD_PARSED_FILE',
      payload: {
        id: 'sym-file',
        fileName: 'symbols.bin',
        text: '',
        parsed: { format: 'rs-dat', meta: {}, traces: [...traces] },
      },
    });
  }, [fileDispatch, traces]);

  if (allTraces.length !== traces.length) return null;
  return (
    <svg width={600} height={200}>
      <SymbolsLayer
        traces={traces}
        showDots
        symbolSetting="always"
        xAxisMap={{ x: { scale: linearScale([0, 4], [0, 600]) } }}
        yAxisMap={{ y: { scale: linearScale([-2, 2], [200, 0]) } }}
        offset={{ left: 0, top: 0, width: 600, height: 200 }}
      />
    </svg>
  );
}

describe('chart samples toggle and mixed-trace dots gating', () => {
  it('renders sample-dots only for non-envelope traces in SymbolsLayer while keeping envelope symbols filled', async () => {
    const normal = makeTestTrace({
      id: 'normal',
      name: 'normal',
      data: [
        { freq: 0, amp: 0 },
        { freq: 1, amp: 1 },
        { freq: 2, amp: 0 },
        { freq: 3, amp: -1 },
        { freq: 4, amp: 0 },
      ],
    });
    const envelope = makeTestTrace({
      id: 'envelope',
      name: 'envelope',
      isUniform: false,
      envelopeOf: 3_000_000,
      data: [
        { freq: 0, amp: -1 },
        { freq: 1, amp: 2 },
        { freq: 2, amp: -1 },
        { freq: 3, amp: 2 },
        { freq: 4, amp: -1 },
      ],
    });

    const { container } = render(
      <StoreRoot>
        <SymbolsFixture traces={[normal, envelope]} />
      </StoreRoot>,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="sample-dot"][data-trace="normal"]')).toHaveLength(5);
    });
    const envelopeDots = container.querySelectorAll('[data-testid="sample-dot"][data-trace="envelope"]');
    expect(envelopeDots).toHaveLength(0);

    const normalSymbolPath = container.querySelector('[data-testid="trace-symbol"][data-trace="normal"] path');
    const envelopeSymbolPath = container.querySelector('[data-testid="trace-symbol"][data-trace="envelope"] path');
    expect(normalSymbolPath).toHaveAttribute('fill', 'none');
    expect(envelopeSymbolPath).toHaveAttribute('fill', 'var(--bg)');
  });

  it('keeps samples-toggle enabled on an empty typed pane', async () => {
    render(
      <StoreRoot>
        <PaneFixture traces={[]} typedEmpty />
      </StoreRoot>,
    );

    const toggle = await screen.findByTestId('samples-toggle');
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('title', 'Show the measured sample points');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables samples-toggle with exact title when all visible pane traces are envelopes', async () => {
    const envelope = makeTestTrace({
      id: 'env-only',
      name: 'env-only',
      isUniform: false,
      envelopeOf: 3_000_000,
      data: [{ freq: 0, amp: -1 }, { freq: 1, amp: 2 }],
    });

    render(
      <StoreRoot>
        <PaneFixture traces={[envelope]} />
      </StoreRoot>,
    );

    const toggle = await screen.findByTestId('samples-toggle');
    await waitFor(() => expect(toggle).toBeDisabled());
    expect(toggle).toHaveAttribute('title', ENVELOPE_SAMPLES_TITLE);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps samples-toggle enabled on mixed traces and disables it when the normal trace is hidden', async () => {
    const normal = makeTestTrace({
      id: 'normal',
      name: 'normal',
      data: [{ freq: 0, amp: 0 }, { freq: 1, amp: 1 }],
    });
    const envelope = makeTestTrace({
      id: 'envelope',
      name: 'envelope',
      isUniform: false,
      envelopeOf: 3_000_000,
      data: [{ freq: 0, amp: -1 }, { freq: 1, amp: 2 }],
    });

    let actions: { hideTrace: (name: string) => void; showTrace: (name: string) => void } | null = null;
    render(
      <StoreRoot>
        <PaneFixture
          traces={[normal, envelope]}
          onReady={next => { actions = next; }}
        />
      </StoreRoot>,
    );

    const toggle = await screen.findByTestId('samples-toggle');
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('title', 'Show the measured sample points');

    act(() => {
      actions?.hideTrace('normal');
    });

    await waitFor(() => expect(toggle).toBeDisabled());
    expect(toggle).toHaveAttribute('title', ENVELOPE_SAMPLES_TITLE);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      actions?.showTrace('normal');
    });

    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('title', 'Show the measured sample points');
  });

  it('disables sample-dots-toggle in PaneSettingsPopover with tooltip when samplesDisabledReason is set', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const contentRef = React.createRef<HTMLDivElement>();
    const settings = { ...defaultPaneSettings(), showSampleDots: true };

    const { rerender } = render(
      <StoreRoot>
        <PaneSettingsPopover
          paneId="pane-1"
          settings={settings}
          sections={['display']}
          paneName="Pane 1"
          current="cartesian"
          tiles={[]}
          pending={null}
          anchor={anchor}
          onAnchorChange={vi.fn()}
          onChoose={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          contentRef={contentRef}
          axes={null}
          onFit={null}
          samplesDisabledReason={ENVELOPE_SAMPLES_TITLE}
          actions={{
            onCopyImage: null,
            onDownloadImage: null,
            onDownloadSvg: null,
            onCopyLatex: null,
            onExportOptions: null,
            onExportData: null,
            onClose: null,
          }}
        />
      </StoreRoot>,
    );

    const disabledToggle = screen.getByTestId('sample-dots-toggle');
    expect(disabledToggle).toBeDisabled();
    expect(disabledToggle).toHaveAttribute('aria-pressed', 'false');
    expect(disabledToggle).toHaveAttribute('title', ENVELOPE_SAMPLES_TITLE);
    const tooltipId = disabledToggle.closest('.ui-tooltip-anchor')?.getAttribute('aria-describedby');
    expect(tooltipId).toBeTruthy();
    const tooltip = tooltipId ? document.getElementById(tooltipId) : null;
    expect(tooltip).toHaveTextContent(ENVELOPE_SAMPLES_TITLE);

    rerender(
      <StoreRoot>
        <PaneSettingsPopover
          paneId="pane-1"
          settings={settings}
          sections={['display']}
          paneName="Pane 1"
          current="cartesian"
          tiles={[]}
          pending={null}
          anchor={anchor}
          onAnchorChange={vi.fn()}
          onChoose={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          contentRef={contentRef}
          axes={null}
          onFit={null}
          actions={{
            onCopyImage: null,
            onDownloadImage: null,
            onDownloadSvg: null,
            onCopyLatex: null,
            onExportOptions: null,
            onExportData: null,
            onClose: null,
          }}
        />
      </StoreRoot>,
    );

    const enabledToggle = screen.getByTestId('sample-dots-toggle');
    expect(enabledToggle).toBeEnabled();
    expect(enabledToggle).toHaveAttribute('aria-pressed', 'true');
    anchor.remove();
  });
});
