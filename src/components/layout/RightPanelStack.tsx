import { useUiState, useUiDispatch } from '../../stores/ui-store';
import { useAnalysisState } from '../../stores/analysis-store';
import { AnalysisPanelStack } from '../analysis/AnalysisPanelStack';
import { ImportExportPanel } from '../panels/ImportExportPanel';
import { DataTablePanel } from '../analysis/DataTablePanel';
import { TraceOpsCard } from '../analysis/TraceOpsCard';
import { Btn } from '../shared/Btn';

type RightPanelTab = 'analysis' | 'trace-ops' | 'import-export' | 'data';

export function RightPanelStack() {
  const ui = useUiState();
  const uiDispatch = useUiDispatch();
  const { analysisOpenState } = useAnalysisState();
  const anyAnalysisOpen = Object.values(analysisOpenState).some(Boolean);

  const activeTab: RightPanelTab = ui.showImportExportPanel
    ? 'import-export'
    : ui.showDT
      ? 'data'
      : ui.showTraceOps
        ? 'trace-ops'
        : 'analysis';

  const hasPanelContent = ui.showImportExportPanel || ui.showDT || ui.showAnalysisPanel || ui.showTraceOps || anyAnalysisOpen;
  if (!ui.showRightPanel || !hasPanelContent) {
    return null;
  }

  const setTab = (tab: RightPanelTab) => {
    uiDispatch({ type: 'SET', payload: { key: 'showRightPanel', value: true } });
    uiDispatch({ type: 'SET', payload: { key: 'showAnalysisPanel', value: tab === 'analysis' } });
    uiDispatch({ type: 'SET', payload: { key: 'showTraceOps', value: tab === 'trace-ops' } });
    uiDispatch({ type: 'SET', payload: { key: 'showImportExportPanel', value: tab === 'import-export' } });
    uiDispatch({ type: 'SET', payload: { key: 'showDT', value: tab === 'data' } });
  };

  return (
    <aside
      style={{
        width: 'min(380px, 38vw)',
        minWidth: '280px',
        maxWidth: '100%',
        borderLeft: '1px solid var(--border)',
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '10px',
          borderBottom: '1px solid var(--border)',
          alignItems: 'center',
        }}
      >
        <TabButton label="Workbench" active={activeTab === 'analysis'} color="#e7b2a5" onClick={() => setTab('analysis')} />
        <TabButton label="Trace Ops" active={activeTab === 'trace-ops'} color="#d9b8eb" onClick={() => setTab('trace-ops')} />
        <TabButton label="Data" active={activeTab === 'data'} color="#f3a6c8" onClick={() => setTab('data')} />
        <TabButton label="Import/Export" active={activeTab === 'import-export'} color="#b7dfc8" onClick={() => setTab('import-export')} />
      </div>
      <div style={{ minHeight: 0, overflow: 'auto', flex: 1 }}>
        {activeTab === 'analysis' && (ui.showAnalysisPanel || anyAnalysisOpen) && <AnalysisPanelStack />}
        {activeTab === 'trace-ops' && ui.showTraceOps && (
          <div style={{ padding: '12px' }}>
            <TraceOpsCard />
          </div>
        )}
        {activeTab === 'import-export' && <ImportExportPanel />}
        {activeTab === 'data' && <DataTablePanel />}
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
      style={{ flex: '1 1 120px', justifyContent: 'center' }}
    >
      {label}
    </Btn>
  );
}
