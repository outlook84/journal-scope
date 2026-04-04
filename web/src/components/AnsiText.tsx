import { memo, type CSSProperties, type ReactNode } from 'react';

import type { HighlightMatcher } from '../types/app';
import { renderHighlightedText } from '../utils/app';

const ansiColors: Record<string, string> = {
  '30': '#1e293b', '31': '#ef4444', '32': '#22c55e', '33': '#eab308',
  '34': '#3b82f6', '35': '#d946ef', '36': '#06b6d4', '37': '#f8fafc',
  '90': '#64748b', '91': '#f87171', '92': '#4ade80', '93': '#facc15',
  '94': '#60a5fa', '95': '#e879f9', '96': '#22d3ee', '97': '#ffffff'
};

export const AnsiText = memo(function AnsiText({
  text,
  highlightMatcher
}: {
  text: string;
  highlightMatcher?: HighlightMatcher | null;
}) {
  if (typeof text !== 'string' || !text.includes('\x1b')) {
    return <>{renderHighlightedText(text, highlightMatcher)}</>;
  }

  const parts = text.split(/\x1b\[([\d;]*)m/);
  const currentStyle: CSSProperties = {};
  const elements: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const part = parts[i];
      if (!part || part === '0' || part === '00') {
        Object.keys(currentStyle).forEach((key) => delete currentStyle[key as keyof CSSProperties]);
      } else {
        for (const code of part.split(';')) {
          if (ansiColors[code]) currentStyle.color = ansiColors[code];
          else if (code === '1') currentStyle.fontWeight = 'bold';
        }
      }
    } else if (parts[i]) {
      elements.push(
        <span key={i} style={Object.keys(currentStyle).length ? { ...currentStyle } : undefined}>
          {renderHighlightedText(parts[i], highlightMatcher)}
        </span>
      );
    }
  }

  return <>{elements}</>;
});
