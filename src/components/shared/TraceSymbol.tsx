import { SYMBOL_STROKE } from '../../domain/dots-and-symbols';
import { isClosedSymbol, symbolPath } from '../../domain/trace-symbols';
import type { TraceSymbol as SymbolKind } from '../../domain/trace-palette';

export function TraceSymbol({ kind, color, background = 'var(--bg)' }: { kind: SymbolKind; color: string; background?: string }) {
  return <path d={symbolPath(kind, 0, 0)} fill={isClosedSymbol(kind) ? background : 'none'} stroke={color} strokeWidth={SYMBOL_STROKE} />;
}
