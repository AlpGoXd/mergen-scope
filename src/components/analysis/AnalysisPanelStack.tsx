import { useUiState } from '../../stores/ui-store';
import { useAnalysisState, useAnalysisDispatch } from '../../stores/analysis-store';
import { useAnalysisRegistry } from '../../hooks/use-analysis-registry';
import { AnalysisMenuCard } from './AnalysisMenuCard';
import { NoisePSDCard } from './spectrum/NoisePSDCard';
import { IP3Card } from './spectrum/IP3Card';
import { ChannelPowerCard } from './spectrum/ChannelPowerCard';
import { OccupiedBandwidthCard } from './spectrum/OccupiedBandwidthCard';
import { BandwidthHelperCard } from './spectrum/BandwidthHelperCard';
import { RippleCard } from './spectrum/RippleCard';
import { RangeStatsCard } from './spectrum/RangeStatsCard';
import { ThresholdCrossingsCard } from './shared/ThresholdCrossingsCard';
import { PeakTableCard } from './spectrum/PeakTableCard';
import { VSWRCard } from './touchstone/VSWRCard';
import { ReturnLossCard } from './touchstone/ReturnLossCard';
import { GroupDelayCard } from './touchstone/GroupDelayCard';
import { ReciprocityIsolationCard } from './touchstone/ReciprocityIsolationCard';
import { StabilityCard } from './touchstone/StabilityCard';
import { AnalysisFeatureCard } from './AnalysisFeatureCard';
import type { AnalysisRegistryEntry } from '../../types/analysis';

/**
 * AnalysisPanelStack component for rendering a scrollable list of active analysis panels on the right.
 * Ported from legacy in app-analysis-components.js.
 */
export function AnalysisPanelStack() {
  const { showAnalysisPanel } = useUiState();
  const { analysisOpenState } = useAnalysisState();
  const analysisDispatch = useAnalysisDispatch();
  const registry = useAnalysisRegistry();

  const anyAnalysisOpen = Object.values(analysisOpenState).some(Boolean);
  const anyPanelOpen = showAnalysisPanel || anyAnalysisOpen;

  if (!anyPanelOpen) return null;

  return (
    <div style={{ overflowY: 'auto', minHeight: 0, display: 'grid', gap: '12px' }}>
        {(showAnalysisPanel || anyAnalysisOpen) && <AnalysisMenuCard />}
        
        {registry.map((entry: AnalysisRegistryEntry) => {
          if (!entry.isOpen) return null;
          
          switch (entry.id) {
            case 'noise-psd': return <NoisePSDCard key={entry.id} />;
            case 'ip3': return <IP3Card key={entry.id} />;
            case 'peak-spur-table': return <PeakTableCard key={entry.id} />;
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
                <div style={{ fontSize: 'var(--font-label)', lineHeight: 'var(--lh-label)', color: 'var(--dim)', padding: '10px', textAlign: 'center' }}>
                  Panel for {entry.id} is coming soon.
                </div>
              </AnalysisFeatureCard>
            );
          }
        })}
    </div>
  );
}
