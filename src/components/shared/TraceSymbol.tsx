import { SYMBOL_STROKE } from '../../domain/dots-and-symbols';
import { isClosedSymbol, symbolPath } from '../../domain/trace-symbols';
import type { TraceSymbol as SymbolKind } from '../../domain/trace-palette';

export function TraceSymbol({ kind, color, background = 'var(--bg)', hollow = false }: { kind: SymbolKind; color: string; background?: string; hollow?: boolean }) {
  return <path d={symbolPath(kind, 0, 0)} fill={isClosedSymbol(kind) && !hollow ? background : 'none'} stroke={color} strokeWidth={SYMBOL_STROKE} />;
}
