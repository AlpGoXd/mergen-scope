import React, { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { useKeyboard } from '../../src/hooks/use-keyboard';
import { useMarkerDispatch, useMarkerState } from '../../src/stores/marker-store';
import { makeTestTrace } from './helpers';
function Harness() {
  useKeyboard(); const dispatch=useMarkerDispatch(); const state=useMarkerState();
  useEffect(()=>{dispatch({type:'PLACE_MARKER',payload:{trace:makeTestTrace(),targetFreq:5}})},[dispatch]);
  return <><span data-testid="count">{state.markers.length}</span><span data-testid="selected">{state.selectedMkrIdx}</span><span data-testid="armed">{state.armed?.kind ?? 'none'}</span><div role="dialog" aria-modal="true"><button>Dialog action</button></div></>;
}
describe('workspace keyboard scope',()=>{
 it('does not mutate the background when a modal button has focus',()=>{
  render(<StoreRoot><Harness /></StoreRoot>); const button=screen.getByRole('button',{name:'Dialog action'}); button.focus();
  for(const key of ['Delete','n','1','Escape']) fireEvent.keyDown(button,{key});
  expect(screen.getByTestId('count').textContent).toBe('1'); expect(screen.getByTestId('selected').textContent).toBe('0'); expect(screen.getByTestId('armed').textContent).toBe('none');
 });
});
