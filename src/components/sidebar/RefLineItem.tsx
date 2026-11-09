import React, { useState, useEffect } from 'react';
import type { RefLine } from '../../types/ref-line';
import type { Pane } from '../../types/pane';
import type { Trace } from '../../types/trace';
import type { LineIntersection } from '../../domain/ref-lines';
import { formatAdaptiveXAxisValue, formatScalarWithUnit } from '../../domain/format';

export interface RefLineItemProps {
  line: RefLine;
  selected: boolean;
  intersections: LineIntersection[];
  allPanes: Pane[];
  onSelect: () => void;
  onRemove: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onUpdateValue: (value: number) => void;
  selectedTrace: Trace | null;
  traceColors: Record<string, string>;
  resolveColor: (traceName: string) => string;
  compact: boolean;
}

const SI_PREFIXES: Record<string, number> = {
  T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3,
  m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12,
};

function parseValue(text: string): number | null {
  const s = text.trim().replace(/\s+/g, '').replace(/µ/g, 'u');
  if (!s) return null;
  const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([A-Za-z]*)$/);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  const suffix = m[2] ?? '';
  if (!suffix) return num;
  const lower = suffix.toLowerCase();
  // frequency units
  if (lower === 'hz') return num;
  if (lower === 'khz') return num * 1e3;
  if (lower === 'mhz') return num * 1e6;
  if (lower === 'ghz') return num * 1e9;
  if (lower === 'thz') return num * 1e12;
  // SI prefix (single char)
  const prefixScale = SI_PREFIXES[suffix[0] ?? ''];
  if (prefixScale != null) return num * prefixScale;
  return num;
}

export function RefLineItem({
  line,
  selected,
  intersections = [],
  allPanes,
  onSelect,
  onRemove,
  onLock,
  onUnlock,
  onUpdateValue,
  selectedTrace,
  resolveColor,
  compact,
}: RefLineItemProps) {
  const isLocked = line.paneIds.length > 1;

  const formatVal = (v: number) => {
    if (line.type === 'v') {
      return formatAdaptiveXAxisValue(v, Math.abs(v) || 1, {
        domain: selectedTrace?.domain ?? 'frequency',
        unit: selectedTrace?.units.x ?? 'Hz',
      });
    }
    return formatScalarWithUnit(v, selectedTrace?.units.y ?? null, { digits: 3 });
  };

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  // Keep edit text in sync when value changes externally (e.g. drag)
  useEffect(() => {
    if (!editing) {
      setEditText(String(line.value));
    }
  }, [line.value, editing]);

  const commitEdit = () => {
    const parsed = parseValue(editText);
    if (parsed != null && Number.isFinite(parsed)) {
      onUpdateValue(parsed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.currentTarget.blur(); }
    if (e.key === 'Escape') { setEditing(false); }
  };

  // Group intersections by pane
  const byPane: Record<string, LineIntersection[]> = {};
  for (const ix of intersections) {
    (byPane[ix.paneId] ??= []).push(ix);
  }

  return (
    <div
      onClick={onSelect}
      style={{
        border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: '8px',
        padding: compact ? '5px 7px' : '7px 9px',
        fontSize: 'var(--font-caption)',
        cursor: 'pointer',
        background: selected ? 'color-mix(in srgb, var(--accent) 6%, var(--bg))' : 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      {/* Row 1: type badge + value + remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: '10px',
          padding: '1px 5px',
          borderRadius: '4px',
          background: line.type === 'v' ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'color-mix(in srgb, var(--refH, #f59e0b) 20%, transparent)',
          color: line.type === 'v' ? 'var(--accent)' : 'var(--refH, #f59e0b)',
          userSelect: 'none',
          flexShrink: 0,
        }}>
          {line.type.toUpperCase()}
        </span>

        {selected && editing ? (
          <input
            autoFocus
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-caption)',
              background: 'var(--input-bg, var(--bg))',
              border: '1px solid var(--accent)',
              borderRadius: '4px',
              padding: '1px 5px',
              color: 'var(--text)',
              minWidth: 0,
            }}
          />
        ) : (
          <span
            style={{ flex: 1, fontFamily: 'var(--font-mono)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onDoubleClick={e => { e.stopPropagation(); setEditText(String(line.value)); setEditing(true); }}
            title="Double-click to edit"
          >
            {formatVal(line.value)}
          </span>
        )}

        {isLocked && (
          <span style={{ fontSize: '9px', color: 'var(--muted)', flexShrink: 0, userSelect: 'none' }}>
            🔒
          </span>
        )}

        <span
          title="Remove line"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ cursor: 'pointer', color: 'var(--dim)', padding: '0 2px', fontSize: '1.2em', flexShrink: 0 }}
        >
          ×
        </span>
      </div>

      {/* Row 2: lock/unlock controls (only when selected) */}
      {selected && (
        <div style={{ display: 'flex', gap: '4px' }}>
          {!isLocked && allPanes.length > 1 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onLock(); }}
              style={{
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              Lock All Panes
            </button>
          )}
          {isLocked && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onUnlock(); }}
              style={{
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              Unlock
            </button>
          )}
        </div>
      )}

      {/* Intersections list */}
      {intersections.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
          {Object.entries(byPane).map(([pid, ixs]) => {
            const paneNum = pid.replace('pane-', '');
            return (
              <div key={pid}>
                {allPanes.length > 1 && (
                  <div style={{ fontSize: '9px', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '1px' }}>
                    P{paneNum}
                  </div>
                )}
                {ixs.map((ix, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: allPanes.length > 1 ? '6px' : '0' }}>
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: resolveColor(ix.traceName),
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.3)',
                    }} />
                    <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {ix.traceName}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {line.type === 'v'
                        ? formatScalarWithUnit(ix.amp, selectedTrace?.units.y ?? null, { digits: 2 })
                        : formatAdaptiveXAxisValue(ix.freq, Math.abs(ix.freq) || 1, {
                            domain: selectedTrace?.domain ?? 'frequency',
                            unit: selectedTrace?.units.x ?? 'Hz',
                          })
                      }
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
