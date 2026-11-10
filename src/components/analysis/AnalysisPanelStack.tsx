// The right panel: only Analysis (spec 5.5). Header with the count and "+ Add analysis"; one kit card per instance.
import { useMemo, useState } from 'react';
import './kit/analysis.css';
import { AddAnalysisMenu, AnalysisEmpty, AnalysisPanel } from './kit/Analysis';
import type { AddMenuFilter, AddMenuItem } from './kit/types';
import { AnalysisInstanceCard } from './AnalysisInstanceCard';
import { PopoverAt } from '../shared/Controls';
import { useAnalysisContext } from '../../hooks/use-analysis-context';
import { useAnalysisDispatch, useAnalysisState } from '../../stores/analysis-store';
import { useUiDispatch } from '../../stores/ui-store';
import { listAddableTools } from '../../domain/analysis/tool-registry';

const RECENT_KEY = 'mergen-recent-analyses';
function readRecent(): string[] {
  try { const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string').slice(0, 3) : []; } catch { return []; }
}
function writeRecent(ids: string[]): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 3))); } catch { /* storage unavailable */ }
}

export function AnalysisPanelStack() {
  const { analyses } = useAnalysisState();
  const analysisDispatch = useAnalysisDispatch();
  const uiDispatch = useUiDispatch();
  const ctx = useAnalysisContext();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AddMenuFilter>('all');
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [recent, setRecent] = useState<string[]>(readRecent);

  const items = useMemo<AddMenuItem[]>(() => listAddableTools({ trace: ctx.targetTrace, inputs: ctx.inputs, analyses }).map(item => ({
    id: item.id, kind: item.kind === 'math' ? 'math' : 'measure', title: item.title, note: item.description,
    ...(item.disabledReason ? { disabledReason: item.disabledReason } : {}), ...(item.open ? { added: true } : {}),
  })), [ctx.targetTrace, ctx.inputs, analyses]);
  const visible = useMemo(() => items.filter(item => (filter === 'all' || item.kind === filter) && (!query || `${item.title} ${item.note}`.toLowerCase().includes(query.toLowerCase()))), [items, filter, query]);
  const recentItems = recent.map(id => items.find(item => item.id === id)).filter((item): item is AddMenuItem => item !== undefined && (filter === 'all' || item.kind === filter));

  const close = () => { setAnchor(null); setQuery(''); setActiveId(undefined); };
  const pick = (id: string) => {
    const picked = items.find(item => item.id === id);
    if (!picked || picked.disabledReason) return;
    const traceId = ctx.targetTrace?.id ?? null;
    const other = ctx.visibleTraces.find(trace => trace.id !== traceId);
    analysisDispatch({ type: 'ADD_ANALYSIS', payload: { toolId: id, source: { traceId, ...(id === 'trace-math' ? { secondTraceId: other?.id ?? null } : {}) } } });
    uiDispatch({ type: 'SET', payload: { key: 'showRightPanel', value: true } });
    const next = [id, ...recent.filter(entry => entry !== id)].slice(0, 3);
    setRecent(next); writeRecent(next);
    close();
  };
  const move = (delta: number) => {
    const enabled = visible.filter(item => !item.disabledReason);
    if (!enabled.length) return;
    const index = enabled.findIndex(item => item.id === activeId);
    setActiveId(enabled[(index + delta + enabled.length) % enabled.length]?.id);
  };
  const onAdd = (button: HTMLElement) => setAnchor(button);

  return (
    <>
      <AnalysisPanel count={analyses.length} addOpen={anchor !== null} onAdd={onAdd}
        empty={<AnalysisEmpty onAdd={onAdd} />}>
        {analyses.map(instance => <AnalysisInstanceCard key={instance.id} instance={instance} />)}
      </AnalysisPanel>
      {anchor ? (
        <PopoverAt label="Add analysis" at={anchor} onClose={close}>
          <div onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
            else if (event.key === 'Enter' && activeId) { event.preventDefault(); pick(activeId); }
          }}>
            <AddAnalysisMenu query={query} filter={filter} {...(recentItems.length ? { recent: recentItems } : {})} items={visible}
              {...(activeId ? { activeId } : {})} onQuery={setQuery} onFilter={setFilter} onPick={pick} />
          </div>
        </PopoverAt>
      ) : null}
    </>
  );
}
