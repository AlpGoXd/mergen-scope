import { Fragment, useMemo } from 'react';
import { formatCount } from '../../domain/import-wizard';
import { inspectBinaryCursor } from '../../domain/parsers/raw-binary';
import type { BinaryEndian, BinaryImportConfig } from '../../domain/parsers/raw-binary';
import { Btn } from '../shared/Btn';

const SKIP_NUDGES: readonly { delta: number; label: string; title: string }[] = [
  { delta: -1, label: '−1', title: 'Move data start back by 1 byte to check alignment' },
  { delta: 1, label: '+1', title: 'Advance data start by 1 byte to check alignment' },
  { delta: 4, label: '+4', title: 'Advance data start by 4 bytes (one 32-bit word)' },
  { delta: 16, label: '+16', title: 'Advance data start by 16 bytes (one hex row)' },
];

const HEX_SIZES: readonly { bytes: number; label: string; title: string }[] = [
  { bytes: 64, label: '64 B', title: 'Show 64 bytes (4 rows) in the hex/ASCII inspector' },
  { bytes: 256, label: '256 B', title: 'Show 256 bytes (16 rows) in the hex/ASCII inspector' },
  { bytes: 512, label: '512 B', title: 'Show 512 bytes (32 rows) in the hex/ASCII inspector' },
  { bytes: 1024, label: '1 KB', title: 'Show 1,024 bytes (64 rows) in the hex/ASCII inspector' },
];

function formatCursorFloat(value: number | null): string {
  if (value === null) return '—';
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? '+Inf' : '−Inf';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e6) return Number(value.toPrecision(6)).toString();
  return value.toExponential(4);
}

export interface BinaryHexInspectorProps {
  readonly buffer: ArrayBuffer;
  readonly mode: BinaryImportConfig['mode'];
  readonly endian: BinaryEndian;
  readonly headerBytes: number;
  readonly hexOffset: number;
  readonly hexSize: number;
  readonly selectedHexByte: number | null;
  readonly onHexSizeChange: (bytes: number) => void;
  readonly onPageOffsetChange: (offset: number) => void;
  readonly onSelectHexByte: (offset: number | null) => void;
  readonly onNudgeSkip: (delta: number) => void;
  readonly onApplySkipOffset: (offset: number) => void;
}

export function BinaryHexInspector({
  buffer,
  mode,
  endian,
  headerBytes,
  hexOffset,
  hexSize,
  selectedHexByte,
  onHexSizeChange,
  onPageOffsetChange,
  onSelectHexByte,
  onNudgeSkip,
  onApplySkipOffset,
}: BinaryHexInspectorProps) {
  const hexShown = Math.min(hexSize, Math.max(0, buffer.byteLength - hexOffset));
  const hexHeading = `Hex · 0x${hexOffset.toString(16).padStart(4, '0')} (${formatCount(hexOffset)} B · ${formatCount(hexShown)} B)`;
  const canHexPrev = hexOffset > 0;
  const canHexNext = hexOffset + hexSize < buffer.byteLength;
  const hexTargetOffset = selectedHexByte !== null && selectedHexByte >= 0 && selectedHexByte < buffer.byteLength
    ? selectedHexByte
    : hexOffset;
  const hexDiffersFromSkip = mode === 'raw' && hexTargetOffset !== headerBytes;

  const hexRows = useMemo(() => {
    const out: { rowOffset: number; addr: string; bytes: number[]; ascii: string }[] = [];
    if (hexShown <= 0) return out;
    const view = new Uint8Array(buffer, hexOffset, hexShown);
    for (let row = 0; row < view.length; row += 16) {
      const slice = view.subarray(row, Math.min(row + 16, view.length));
      const rowOffset = hexOffset + row;
      const addr = rowOffset.toString(16).padStart(4, '0');
      const bytes = Array.from(slice);
      const ascii = bytes.map(b => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('');
      out.push({ rowOffset, addr, bytes, ascii });
    }
    return out;
  }, [buffer, hexOffset, hexShown]);

  const cursorReadings = useMemo(
    () => (selectedHexByte !== null ? inspectBinaryCursor(buffer, selectedHexByte, endian) : null),
    [buffer, selectedHexByte, endian],
  );

  return (
    <>
      <div className="iw-hex-head">
        <h3 className="t-section iw-hex-title" data-testid="binary-wizard-hex-heading" title={hexHeading}>{hexHeading}</h3>
        <div className="iw-hex-tools" aria-label="Hex inspector controls">
          {HEX_SIZES.map(opt => (
            <Btn
              key={opt.bytes}
              small
              variant="slate"
              active={hexSize === opt.bytes}
              title={opt.title}
              onClick={() => onHexSizeChange(opt.bytes)}
            >
              {opt.label}
            </Btn>
          ))}
          <Btn
            small
            disabled={!canHexPrev}
            aria-label="Previous hex page"
            title={`Jump back ${hexSize} bytes in the hex inspector`}
            onClick={() => {
              onSelectHexByte(null);
              onPageOffsetChange(Math.max(0, hexOffset - hexSize));
            }}
          >
            ◀
          </Btn>
          <Btn
            small
            disabled={!canHexNext}
            aria-label="Next hex page"
            title={`Jump forward ${hexSize} bytes in the hex inspector`}
            onClick={() => {
              onSelectHexByte(null);
              onPageOffsetChange(Math.min(Math.max(0, buffer.byteLength - 16), hexOffset + hexSize));
            }}
          >
            ▶
          </Btn>
        </div>
      </div>

      <div className="iw-hex t-readout" data-testid="binary-wizard-hex" role="region" aria-label="Hex inspector (click any byte to decode and set skip)">
        {hexRows.length === 0 ? '(end of file)' : (
          <div className="iw-hex-grid">
            {hexRows.map(row => (
              <div key={row.rowOffset} className="iw-hex-row">
                <span className="iw-hex-addr">{row.addr}</span>
                <span className="iw-hex-bytes">
                  {row.bytes.map((byteVal, col) => {
                    const absOffset = row.rowOffset + col;
                    const hex = byteVal.toString(16).padStart(2, '0');
                    const isSelected = selectedHexByte === absOffset;
                    const isSkipStart = mode === 'raw' && headerBytes === absOffset;
                    return (
                      <Fragment key={absOffset}>
                        {col > 0 ? ' ' : ''}
                        <button
                          type="button"
                          className={`iw-hex-byte t-readout${isSelected ? ' is-selected' : ''}${isSkipStart ? ' is-skip-start' : ''}`}
                          aria-pressed={isSelected}
                          aria-label={`Byte ${absOffset} (0x${absOffset.toString(16).padStart(4, '0')}): ${hex}`}
                          title={`Offset ${formatCount(absOffset)} B (0x${absOffset.toString(16).padStart(4, '0')}) — click to inspect decoded values`}
                          onClick={() => onSelectHexByte(selectedHexByte === absOffset ? null : absOffset)}
                        >
                          {hex}
                        </button>
                      </Fragment>
                    );
                  })}
                  {row.bytes.length < 16 ? ' '.repeat((16 - row.bytes.length) * 3) : ''}
                </span>
                <span className="iw-hex-ascii">{row.ascii}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {cursorReadings && cursorReadings.byteHex !== null && (
        <div className="iw-hex-cursor t-caption" data-testid="binary-wizard-hex-cursor">
          <div className="iw-hex-cursor-vals t-readout">
            <span>@{formatCount(cursorReadings.offset)} B (0x{cursorReadings.offset.toString(16).padStart(4, '0')} · {endian.toUpperCase()})</span>
            {cursorReadings.u8 !== null && <span>u8:{cursorReadings.u8}</span>}
            {cursorReadings.i16 !== null && <span>i16:{cursorReadings.i16}</span>}
            {cursorReadings.i24 !== null && <span>i24:{cursorReadings.i24}</span>}
            {cursorReadings.i32 !== null && <span>i32:{cursorReadings.i32}</span>}
            {cursorReadings.f16 !== null && <span>f16:{formatCursorFloat(cursorReadings.f16)}</span>}
            {cursorReadings.f32 !== null && <span>f32:{formatCursorFloat(cursorReadings.f32)}</span>}
            {cursorReadings.f64 !== null && <span>f64:{formatCursorFloat(cursorReadings.f64)}</span>}
          </div>
        </div>
      )}

      {mode === 'raw' && (
        <div className="iw-hex-foot">
          <div className="iw-nudges" aria-label="Header skip step">
            <span className="t-caption">Nudge skip:</span>
            {SKIP_NUDGES.map(item => (
              <Btn
                key={item.label}
                small
                aria-label={`Skip ${item.label} bytes`}
                title={item.title}
                onClick={() => {
                  onSelectHexByte(null);
                  onNudgeSkip(item.delta);
                }}
              >
                {item.label} B
              </Btn>
            ))}
          </div>
          <Btn
            small
            variant="slate"
            disabled={!hexDiffersFromSkip}
            title={hexDiffersFromSkip
              ? `Set Skip bytes to ${formatCount(hexTargetOffset)} B (0x${hexTargetOffset.toString(16)})`
              : 'Click any byte above or page the hex viewer to another offset, then click here to set Skip bytes'}
            onClick={() => onApplySkipOffset(hexTargetOffset)}
          >
            Set skip = {formatCount(hexTargetOffset)} B
          </Btn>
        </div>
      )}
    </>
  );
}
