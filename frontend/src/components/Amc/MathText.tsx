/**
 * Text with TeX in it: `$...$` inline and `$$...$$` on its own line, the
 * convention every problem in backend/amc/bank.py is written in.
 *
 * Rendered with KaTeX to an HTML string. KaTeX escapes everything it renders,
 * and the plain text between the math is escaped here, so nothing from the
 * bank reaches the DOM unescaped. `\$` outside math is a literal dollar sign.
 */
import { memo, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type Piece = { kind: 'text' | 'inline' | 'display'; value: string };

export function splitMath(source: string): Piece[] {
  const pieces: Piece[] = [];
  let buffer = '';
  let mode: Piece['kind'] = 'text';
  let i = 0;
  const flush = (next: Piece['kind']) => {
    if (buffer) pieces.push({ kind: mode, value: buffer });
    buffer = '';
    mode = next;
  };
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\' && source[i + 1] === '$') {
      // A literal dollar: kept as `\$` inside math (KaTeX reads it), bare outside.
      buffer += mode === 'text' ? '$' : '\\$';
      i += 2;
      continue;
    }
    if (ch === '$') {
      const double = source[i + 1] === '$';
      if (mode === 'text') flush(double ? 'display' : 'inline');
      else flush('text');
      i += double ? 2 : 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  // An unclosed `$` is shown as written rather than swallowing the rest.
  if (mode !== 'text') {
    pieces.push({ kind: 'text', value: (mode === 'display' ? '$$' : '$') + buffer });
  } else if (buffer) {
    pieces.push({ kind: 'text', value: buffer });
  }
  return pieces;
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMath(source: string): string {
  return splitMath(source)
    .map((piece) => {
      if (piece.kind === 'text') return escape(piece.value);
      try {
        return katex.renderToString(piece.value, {
          displayMode: piece.kind === 'display',
          throwOnError: false,
          strict: 'ignore',
        });
      } catch {
        return `<code>${escape(piece.value)}</code>`;
      }
    })
    .join('');
}

export const MathText = memo(function MathText({
  text,
  as: Tag = 'span',
  className,
}: {
  text: string;
  as?: 'span' | 'p' | 'div';
  className?: string;
}) {
  const html = useMemo(() => renderMath(text), [text]);
  // eslint-disable-next-line react/no-danger -- escaped above; see the module note
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
