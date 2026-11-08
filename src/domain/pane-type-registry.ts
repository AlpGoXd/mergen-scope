import type { Trace } from '../types/trace';
import type { Capability, PaneTypeDefinition, PaneTypeId } from '../types/registry-contract';
import { resolveDataKind } from './data-kind-registry';

export interface PaneTypeAdapters {
  /** Supplied by the pane/domain owner so this registry does not duplicate Smith eligibility rules. */
  readonly smithCapability: (trace: Trace) => Capability;
}

function scalarTraceCapability(trace: Trace): Capability {
  const dataKind = resolveDataKind(trace);
  if (!dataKind.allowed) return dataKind;
  return { allowed: true };
}

export function createPaneTypeRegistry(
  adapters: PaneTypeAdapters,
): Readonly<Record<PaneTypeId, PaneTypeDefinition>> {
  return {
    chart: {
      id: 'chart',
      title: 'Chart',
      description: 'Cartesian plot of supported scalar traces.',
      appliesTo: scalarTraceCapability,
    },
    smith: {
      id: 'smith',
      title: 'Smith',
      description: 'Smith plot for eligible complex reflection data.',
      appliesTo: adapters.smithCapability,
    },
    table: {
      id: 'table',
      title: 'Table',
      description: 'Tabular view of supported scalar traces.',
      appliesTo: scalarTraceCapability,
    },
  };
}
