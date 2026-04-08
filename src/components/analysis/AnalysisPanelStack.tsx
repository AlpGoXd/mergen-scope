import { useMemo } from 'react';
import { useUiState } from '../../stores/ui-store';
import { useAnalysisState, useAnalysisDispatch } from '../../stores/analysis-store';
import { useFileState } from '../../stores/file-store';
import { usePaneState } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { AnalysisMenuCard } from './AnalysisMenuCard';
import { TraceOpsCard } from './TraceOpsCard';
import { NoisePSDCard } from './spectrum/NoisePSDCard';
import { IP3Card } from './spectrum/IP3Card';
import { ChannelPowerCard } from './spectrum/ChannelPowerCard';
import { OccupiedBandwidthCard } from './spectrum/OccupiedBandwidthCard';
import { BandwidthHelperCard } from './spectrum/BandwidthHelperCard';
import { RippleCard } from './spectrum/RippleCard';
import { RangeStatsCard } from './spectrum/RangeStatsCard';
import { ThresholdCrossingsCard } from './shared/ThresholdCrossingsCard';
import { PeakSpurTableCard } from './shared/PeakSpurTableCard';
import { VSWRCard } from './touchstone/VSWRCard';
import { ReturnLossCard } from './touchstone/ReturnLossCard';
import { GroupDelayCard } from './touchstone/GroupDelayCard';
import { ReciprocityIsolationCard } from './touchstone/ReciprocityIsolationCard';
import { StabilityCard } from './touchstone/StabilityCard';
import { AnalysisFeatureCard } from './AnalysisFeatureCard';
import { makeAnalysisRegistry, resolveAnalysisTarget } from '../../domain/analysis/registry';
import type { AnalysisRegistryEntry } from '../../types/analysis';

/**
 * AnalysisPanelStack component for rendering a scrollable list of active analysis panels on the right.
 * Ported from legacy in app-analysis-components.js.
 */
export function AnalysisPanelStack() {
  const { showAnalysisPanel, showTraceOps, selectedTraceName } = useUiState();
  const { 
    analysisOpenState, 
    noiseResults, 
    ip3Results, 
    peakResults, 
    bandwidthResults, 
    rippleResults, 
    rangeStatsResults 
  } = useAnalysisState();
  const { files } = useFileState();
  const { activePaneId, tracePaneMap, sharedZoom } = usePaneState();
  const { allTraces, allDatasets, allDisplayTraces } = useTraceState();
  const analysisDispatch = useAnalysisDispatch();

  // Resolve analysis target for the active pane
  const target = useMemo(() => {
    const paneTraces = allTraces.filter(t => tracePaneMap[t.name] === activePaneId);
    return resolveAnalysisTarget({
      paneId: activePaneId || '',
      paneTraces,
      activeTraceName: selectedTraceName,
      zoom: sharedZoom,
      files,
      datasets: allDatasets,
      displayTraces: allDisplayTraces,
    });
  }, [activePaneId, allDatasets, allDisplayTraces, allTraces, tracePaneMap, selectedTraceName, sharedZoom, files]);

  // Counts for the markers/badges (if any)
  const counts = useMemo(() => ({
    'noise-psd': Object.keys(noiseResults).length,
    'ip3': Object.keys(ip3Results).length,
    'peak-spur-table': Object.keys(peakResults).length,
    'bandwidth-helper': Object.keys(bandwidthResults).length,
    'ripple-flatness': Object.keys(rippleResults).length,
    'range-stats': Object.keys(rangeStatsResults).length,
  }), [noiseResults, ip3Results, peakResults, bandwidthResults, rippleResults, rangeStatsResults]);

  const registry = useMemo(() => 
    makeAnalysisRegistry(analysisOpenState, counts, { target }),
    [analysisOpenState, counts, target]
  );

  const anyAnalysisOpen = Object.values(analysisOpenState).some(Boolean);
  const anyPanelOpen = showAnalysisPanel || showTraceOps || anyAnalysisOpen;

  if (!anyPanelOpen) return null;

  return (
    <div style={{ padding: '12px', overflowY: 'auto', minHeight: 0, display: 'grid', gap: '12px' }}>
        {(showAnalysisPanel || anyAnalysisOpen) && <AnalysisMenuCard />}
        {showTraceOps && <TraceOpsCard />}
        
        {registry.map((entry: AnalysisRegistryEntry) => {
          if (!entry.isOpen) return null;
          
          switch (entry.id) {
            case 'noise-psd': return <NoisePSDCard key={entry.id} />;
            case 'ip3': return <IP3Card key={entry.id} />;
            case 'peak-spur-table': return <PeakSpurTableCard key={entry.id} />;
            case 'channel-power': return <ChannelPowerCard key={entry.id} />;
            case 'occupied-bandwidth': return <OccupiedBandwidthCard key={entry.id} />;
            case 'bandwidth-helper': return <BandwidthHelperCard key={entry.id} />;
            case 'threshold-crossings': return <ThresholdCrossingsCard key={entry.id} />;
            case 'ripple-flatness': return <RippleCard key={entry.id} />;
            case 'range-stats': return <RangeStatsCard key={entry.id} />;
            case 'vswr': return <VSWRCard key={entry.id} />;
            case 'return-loss': return <ReturnLossCard key={entry.id} />;
            case 'group-delay': return <GroupDelayCard key={entry.id} />;
            case 'reciprocity-isolation': return <ReciprocityIsolationCard key={entry.id} />;
            case 'touchstone-stability': return <StabilityCard key={entry.id} />;
            default: return (
              <AnalysisFeatureCard 
                key={entry.id}
                title={entry.title} 
                onClose={() => analysisDispatch({ type: 'TOGGLE_PANEL', payload: { id: entry.id, forceValue: false } })}
              >
                <div style={{ fontSize: '11px', color: 'var(--dim)', padding: '10px', textAlign: 'center' }}>
                  Panel for {entry.id} is coming soon.
                </div>
              </AnalysisFeatureCard>
            );
          }
        })}
    </div>
  );
}
