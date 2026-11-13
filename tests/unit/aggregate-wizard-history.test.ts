import {expect,it} from 'vitest';
import {initialWorkspaceEngine,workspaceEngineReducer} from '../../src/stores/aggregate-workspace-store';

it('undoes wizard dismissal and import error dismissal as their own commands',()=>{
 let engine=initialWorkspaceEngine();
 engine=workspaceEngineReducer(engine,{type:'change',command:{slice:'files',action:{type:'QUEUE_WIZARD',payload:{id:'w',fileName:'ambiguous.csv',rawText:'x,y\n0,1\n1,2'}}}});
 expect(engine.present.files.wizardQueue).toHaveLength(1);
 engine=workspaceEngineReducer(engine,{type:'change',command:{slice:'files',action:{type:'SKIP_WIZARD',payload:{id:'w'}}}});
 expect(engine.present.files.wizardQueue).toHaveLength(0);
 engine=workspaceEngineReducer(engine,{type:'undo'}); expect(engine.present.files.wizardQueue).toHaveLength(1);
 engine=workspaceEngineReducer(engine,{type:'redo'}); expect(engine.present.files.wizardQueue).toHaveLength(0);
 engine=workspaceEngineReducer(engine,{type:'change',command:{slice:'files',action:{type:'REPORT_IMPORT_ERROR',payload:{fileName:'bad',message:'bad'}}}});
 const id=engine.present.files.importErrors[0]?.id; if(!id) throw Error('error');
 engine=workspaceEngineReducer(engine,{type:'change',command:{slice:'files',action:{type:'DISMISS_IMPORT_ERROR',payload:{id}}}});
 engine=workspaceEngineReducer(engine,{type:'undo'}); expect(engine.present.files.importErrors).toHaveLength(1);
});
