import { describe, expect, it } from 'vitest';
import { initialWorkspaceState, snapshotFromWorkspace, workspaceReducer } from '../../src/stores/aggregate-workspace-store';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';
import { parseTabularFile } from '../../src/domain/parsers/tabular';

describe('tabular source columns', () => {
  it('retains the source indices and headers when a middle selected column has no samples', () => {
    const parsed = parseTabularFile('time,first,empty,last\n0,1,,3\n1,2,,4', 'sample.csv', {
      delimiter:',', skipRows:1, xCol:0, yCols:[1,2,3], xMult:1, yMult:1,
      domain:'time', confidence:1, headers:['time','first','empty','last'],
    });
    expect(parsed.columnIdentities).toEqual([{index:1,header:'first'},{index:3,header:'last'}]);
    expect(parsed.displayTraces).toHaveLength(2);
    const state = workspaceReducer(initialWorkspaceState(), {slice:'files', action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'sample.csv',parsed,text:'source'}}});
    const snapshot = snapshotFromWorkspace(state);
    const restored = migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)));
    expect(restored?.files[0]?.columnIdentities).toEqual(parsed.columnIdentities);
    if (!snapshot) throw new Error('missing snapshot');
    const corrupt = {...snapshot, files:snapshot.files.map(file => ({...file,columnIdentities:[{index:1}]}))};
    expect(migrateWorkspaceV5(corrupt)).toBeNull();
  });
  it('keeps source columns aligned after deleting a middle view and saving', () => {
    const parsed = parseTabularFile('time,a,b,c\n0,1,2,3\n1,2,3,4', 'sample.csv', {
      delimiter:',', skipRows:1, xCol:0, yCols:[1,2,3], xMult:1, yMult:1,
      domain:'time', confidence:1, headers:['time','a','b','c'],
    });
    let state = workspaceReducer(initialWorkspaceState(), {slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'sample.csv',parsed,text:'source'}}});
    const middle = state.files.files[0]?.displayTraces?.[1];
    if (!middle) throw new Error('missing middle view');
    state = workspaceReducer(state,{slice:'files',action:{type:'DELETE_DISPLAY_TRACE',payload:{fileId:'f',displayTraceId:middle.id}}});
    const snapshot = snapshotFromWorkspace(state);
    const loaded = migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)));
    expect(loaded?.files[0]?.columnIdentities).toEqual([{index:1,header:'a'},{index:3,header:'c'}]);
    expect(loaded?.files[0]?.displayTraces).toHaveLength(2);
  });

  it('uses changed physical units instead of stale wizard labels', () => {
    const config={delimiter:',',skipRows:1,xCol:0,yCols:[1],xMult:1,yMult:1,domain:'frequency' as const,confidence:1,headers:['Frequency (Hz)','Current (V)']};
    const parsed=parseTabularFile('Frequency (MHz),Current (A)\n0,1\n1,2','new.csv',config);
    expect(parsed.traces[0]?.units).toEqual({x:'MHz',y:'A'});
    expect(parsed.columnIdentities).toEqual([{index:1,header:'Current (A)'}]);
  });

});
