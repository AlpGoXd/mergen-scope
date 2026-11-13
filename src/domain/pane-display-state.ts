/** Decide which body and header a pane needs from its persistent type and membership. */
export function paneDisplayState(pane: { readonly typed: boolean }, traceCount: number): 'picker' | 'empty-typed' | 'content' {
  if (traceCount > 0) return 'content';
  return pane.typed ? 'empty-typed' : 'picker';
}
