import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AggregateWorkspaceProvider, useAggregateWorkspace } from '../../src/stores/aggregate-workspace-store';
import { useTheme } from '../../src/hooks/use-theme';
import { useWorkspaceV5 } from '../../src/hooks/use-workspace-v5';
import { useUiDispatch } from '../../src/stores/ui-store';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';

afterEach(()=>{vi.restoreAllMocks();document.documentElement.className='';});
it('keeps browser theme and computed palette coherent through undo and legacy glass load',async()=>{
 const original=window.getComputedStyle;
 vi.spyOn(window,'getComputedStyle').mockImplementation(element=>new Proxy(original(element),{get(target,prop){if(prop==='getPropertyValue') return ()=>document.documentElement.classList.contains('theme-dark')?'dark-token':'light-token';return Reflect.get(target,prop)}}));
 const {result}=renderHook(()=>({theme:useTheme(),workspace:useWorkspaceV5(),engine:useAggregateWorkspace(),ui:useUiDispatch()}),{wrapper:({children}:{children:React.ReactNode})=><AggregateWorkspaceProvider>{children}</AggregateWorkspaceProvider>});
 act(()=>result.current.theme.setTheme('dark')); await waitFor(()=>expect(result.current.theme.colors?.tr[0]).toBe('dark-token'));
 act(()=>result.current.ui({type:'SET',payload:{key:'noiseFilter',value:'median'}})); act(()=>result.current.engine.historyDispatch({type:'undo'}));
 const legacy=migrateWorkspaceV5({version:4,files:[],ui:{theme:'glass'}}); if(!legacy) throw Error('legacy');
 act(()=>result.current.workspace.restore(legacy,true)); await waitFor(()=>expect(result.current.theme.theme).toBe('dark'));
 expect(document.documentElement.classList.contains('theme-dark')).toBe(true); expect(result.current.theme.colors?.tr[0]).toBe('dark-token');
 expect(result.current.workspace.getSnapshot()?.ui).not.toHaveProperty('theme');
});
