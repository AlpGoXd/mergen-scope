import { expect, it } from 'vitest';
import { createTransactionHistory } from '../../src/domain/transaction-history';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';

it('keeps the action message and oversized status together without offering history', () => {
  const initial = initialWorkspaceEngine();
  const engine = {...initial,history:createTransactionHistory({maxBytes:100})};
  const changed = workspaceEngineReducer(engine,{type:'change',toastMessage:'Removed trace',command:{slice:'ui',action:{type:'SET',payload:{key:'ip3Gain',value:'12345'}}}});
  expect(changed.toastMessage).toBe('Removed trace');
  expect(changed.historyNotice).toBe('oversized');
  expect(changed.history.past).toHaveLength(0);
  expect(changed.present.ui.ip3Gain).toBe('12345');
});
