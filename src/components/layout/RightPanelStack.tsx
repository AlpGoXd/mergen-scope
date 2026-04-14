import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { AnalysisPanelStack } from '../analysis/AnalysisPanelStack';
import { ImportExportPanel } from '../panels/ImportExportPanel';
import { DataTablePanel } from '../panels/DataTablePanel';
import { TraceOpsCard } from '../analysis/TraceOpsCard';
import { Btn } from '../shared/Btn';
import { PretextLabel } from '../shared/PretextLabel';

export function RightPanelStack({ width = 280 }: { width?: number }) {
  const ui = useUiState();
  const uiDispatch = useUiDispatch();

  if (!ui.showRightPanel) {
    return null;
  }

  const toggleSection = (key: 'showAnalysisPanel' | 'showTraceOps' | 'showImportExportPanel') => {
    uiDispatch({ type: 'SET', payload: { key: 'showRightPanel', value: true } });
    if (ui.showDT) {
      uiDispatch({ type: 'SET', payload: { key: 'showDT', value: false } });
    }
    uiDispatch({ type: 'SET', payload: { key, value: !ui[key] } });
  };

  const toggleData = () => {
    uiDispatch({ type: 'SET', payload: { key: 'showRightPanel', value: true } });
    uiDispatch({ type: 'SET', payload: { key: 'showDT', value: !ui.showDT } });
  };

  return (
    <aside
      style={{
        width: `${width}px`,
        minWidth: '220px',
        maxWidth: 'min(45vw, 600px)',
        borderLeft: '1px solid var(--border)',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, white), var(--card))',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '8px 10px 8px', borderBottom: '1px solid var(--border)', display: 'grid', gap: '6px' }}>
        <div>
          <div style={{ fontSize: 'var(--font-caption)', fontWeight: 400, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Tools
          </div>
          <div style={{ fontSize: 'var(--font-title)', fontWeight: 400, color: 'var(--text)', marginTop: '2px' }}>
            Contextual tools and numeric results
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <TabButton label="Analysis" active={ui.showAnalysisPanel} color="#e48f77" onClick={() => toggleSection('showAnalysisPanel')} />
          <TabButton label="Trace Ops" active={ui.showTraceOps} color="#c786ec" onClick={() => toggleSection('showTraceOps')} />
          <TabButton label="Import/Export" active={ui.showImportExportPanel} color="#71c59a" onClick={() => toggleSection('showImportExportPanel')} />
          <TabButton label="Data" active={ui.showDT} color="#ee6faa" onClick={toggleData} />
        </div>
      </div>

      <div style={{ minHeight: 0, overflow: 'auto', flex: 1 }}>
        {ui.showDT ? (
          <DataTablePanel />
        ) : (
          <div style={{ padding: '10px', display: 'grid', gap: '10px' }}>
            {ui.showAnalysisPanel && <AnalysisPanelStack />}
            {ui.showTraceOps && <TraceOpsCard />}
            {ui.showImportExportPanel && <ImportExportPanel />}
            {!ui.showAnalysisPanel && !ui.showTraceOps && !ui.showImportExportPanel && (
              <div
                style={{
                  padding: '14px',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, var(--card) 94%, white)',
                  color: 'var(--dim)',
                  fontSize: 'var(--font-body)',
                }}
              >
                Open one or more tool groups above. Data is exclusive and uses the full right panel.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function TabButton(props: { label: string; active: boolean; color: string; onClick: () => void }) {
  const { label, active, color, onClick } = props;
  return (
    <Btn
      active={active}
      soft
      color={color}
      onClick={onClick}
      style={{ flex: '1 1 108px', justifyContent: 'center', minWidth: 0, whiteSpace: 'normal', textAlign: 'center', padding: '6px 10px' }}
    >
      <PretextLabel
        text={label}
        font='400 var(--font-label) system-ui'
        lineHeight='var(--lh-label)'
        maxLines={3}
        style={{ width: '100%' }}
        lineStyle={{ whiteSpace: 'normal' }}
      />
    </Btn>
  );
}
