import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { layout, layoutWithLines, prepare, prepareWithSegments } from '@chenglou/pretext';

type PretextLabelProps = {
  text: string;
  title?: string;
  font: string;
  lineHeight: number | string;
  maxLines?: number;
  style?: CSSProperties;
  lineStyle?: CSSProperties;
};

function resolveCssValue(value: string): string {
  if (typeof window === 'undefined' || !value.includes('var(')) {
    return value;
  }

  return value.replace(/var\((--[^)]+)\)/g, (_, token: string) => {
    const resolved = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return resolved || value;
  });
}

function resolveLineHeight(value: number | string): number {
  if (typeof value === 'number') {
    return value;
  }

  const resolved = resolveCssValue(value);
  const numeric = Number.parseFloat(resolved);
  return Number.isFinite(numeric) ? numeric : 18;
}

function fitLineWithEllipsis(text: string, width: number, font: string, lineHeight: number): string {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return '';
  }

  const ellipsis = '...';
  const chars = Array.from(trimmed);

  for (let length = chars.length; length > 0; length -= 1) {
    const candidate = `${chars.slice(0, length).join('').trimEnd()}${ellipsis}`;
    if (layout(prepare(candidate, font), width, lineHeight).lineCount <= 1) {
      return candidate;
    }
  }

  return ellipsis;
}

export function PretextLabel({
  text,
  title,
  font,
  lineHeight,
  maxLines = 4,
  style,
  lineStyle,
}: PretextLabelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const resolvedFont = useMemo(() => resolveCssValue(font), [font]);
  const resolvedLineHeight = useMemo(() => resolveLineHeight(lineHeight), [lineHeight]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const update = () => setWidth(node.clientWidth);
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const prepared = useMemo(() => prepareWithSegments(text, resolvedFont, { whiteSpace: 'pre-wrap' }), [resolvedFont, text]);

  const lines = useMemo(() => {
    if (width <= 1) {
      return [text];
    }

    const result = layoutWithLines(prepared, width, resolvedLineHeight);
    if (result.lines.length <= maxLines) {
      return result.lines.map((line) => line.text);
    }

    const nextLines = result.lines.slice(0, maxLines).map((line) => line.text);
    nextLines[maxLines - 1] = fitLineWithEllipsis(nextLines[maxLines - 1] ?? '', width, resolvedFont, resolvedLineHeight);
    return nextLines;
  }, [maxLines, prepared, resolvedFont, resolvedLineHeight, text, width]);

  return (
    <div ref={containerRef} title={title ?? text} style={{ minWidth: 0, ...style }}>
      {lines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          style={{
            overflow: 'hidden',
            textOverflow: 'clip',
            whiteSpace: 'nowrap',
            lineHeight: `${resolvedLineHeight}px`,
            ...lineStyle,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}


