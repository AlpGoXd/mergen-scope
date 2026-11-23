import type { AnalysisTool } from '../../../types/registry-contract';
import { antennaFarFieldCapability, computeAntennaFarField } from '../antenna-far-field';

export const antennaFarFieldTool: AnalysisTool<Record<string, never>> = {
  kind: 'measure',
  meta: {
    id: 'antenna-far-field',
    title: 'Antenna far field',
    description: 'Measure beamwidth, peak bearing, front-to-back ratio and secondary lobes on a gain cut.',
  },
  params: {},
  outputs: [{ type: 'numbers' }],
  appliesTo: antennaFarFieldCapability,
  compute: ({ traces }) => {
    const trace = traces[0];
    const result = trace && computeAntennaFarField(trace);
    if (!result) return [];
    const { peak, beam3, beam10, oppositeGain, firstMinimumWidth, secondaryLobe } = result;
    return [{ type: 'numbers', values: {
      peakAngle: peak.freq, peakGain: peak.amp,
      ...(beam3 ? { bw3: beam3.bandwidth, bw3Left: beam3.left, bw3Right: beam3.right } : {}),
      ...(beam10 ? { bw10: beam10.bandwidth } : {}),
      ...(oppositeGain === undefined ? {} : { frontToBack: peak.amp - oppositeGain, oppositeGain }),
      ...(firstMinimumWidth === undefined ? {} : { firstMinimumWidth }),
      ...(secondaryLobe ? { secondaryLobe: secondaryLobe.amp - peak.amp, secondaryAngle: secondaryLobe.freq } : {}),
    } }];
  },
};
