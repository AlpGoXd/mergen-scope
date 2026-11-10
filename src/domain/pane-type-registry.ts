import type { Trace } from '../types/trace';
import type { Capability, PaneTypeDefinition, PaneTypeId } from '../types/registry-contract';
import { resolveDataKind } from './data-kind-registry';
import type { PaneRenderMode } from '../types/pane';

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
      status: 'available', iconKey: 'chart', settings: ['display', 'grid'], renderMode: 'cartesian',
      appliesTo: scalarTraceCapability,
    },
    table: {
      id: 'table',
      title: 'Table',
      description: 'Tabular view of supported scalar traces.',
      status: 'later', laterReason: 'Planned, not built yet', iconKey: 'table', settings: ['table'], renderMode: 'table',
      appliesTo: scalarTraceCapability,
    },
    smith: {
      id: 'smith', title: 'Smith', description: 'Smith: planned (separate build)',
      status: 'later', laterReason: 'Planned, not built yet', iconKey: 'smith', settings: [], renderMode: 'smith',
      appliesTo: adapters.smithCapability,
    },
    polar: {
      id: 'polar', title: 'Polar', description: 'Polar: planned, added when a data kind needs it',
      status: 'later', laterReason: 'Planned, not built yet', iconKey: 'polar', settings: [], renderMode: null,
      appliesTo: () => ({ allowed: false, reason: 'Planned, not built yet' }),
    },
    eye: {
      id: 'eye', title: 'Eye', description: 'Eye: planned, added when a data kind needs it',
      status: 'later', laterReason: 'Planned, not built yet', iconKey: 'eye', settings: [], renderMode: null,
      appliesTo: () => ({ allowed: false, reason: 'Planned, not built yet' }),
    },
    spectrogram: {
      id: 'spectrogram', title: 'Spectrogram', description: 'Spectrogram: planned, added when a data kind needs it',
      status: 'later', laterReason: 'Planned, not built yet', iconKey: 'spectrogram', settings: [], renderMode: null,
      appliesTo: () => ({ allowed: false, reason: 'Planned, not built yet' }),
    },
  };
}

export function paneTypeOfMode(mode: PaneRenderMode): PaneTypeId {
  if (mode === 'cartesian') return 'chart';
  if (mode === 'table') return 'table';
  return 'smith';
}

export function selectableTypes(registry: Readonly<Record<PaneTypeId, PaneTypeDefinition>>): readonly PaneTypeDefinition[] {
  return Object.values(registry).filter(type => type.status === 'available');
}

export function typeForTrace(
  registry: Readonly<Record<PaneTypeId, PaneTypeDefinition>>, trace: Trace, currentType?: PaneTypeId,
): { readonly type: PaneTypeDefinition | null; readonly reason?: string } {
  const types = selectableTypes(registry);
  const current = types.find(type => type.id === currentType);
  const ordered = current ? [current, ...types.filter(type => type !== current)] : types;
  let reason: string | undefined;
  for (const type of ordered) {
    const capability = type.appliesTo(trace);
    if (capability.allowed) return { type };
    reason ??= capability.reason;
  }
  return { type: null, reason };
}
