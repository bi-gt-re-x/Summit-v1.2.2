/**
 * Text with LaTeX in it, drawn with KaTeX.
 *
 * Problems mark their math with `\( ... \)` (backend/tracking/mathtext.py says
 * why it's never `$`), so anything outside those markers is ordinary text, and a
 * dollar sign is a dollar sign.
 *
 * KaTeX is a big download and most problems have no math in them, so it only
 * loads the first time a string needs it. Until then the math shows as what
 * you'd type, for the moment it takes to arrive. KaTeX draws in `currentColor`,
 * so light and dark come along for free.
 */
import { useEffect, useMemo, useState } from 'react';
import type { KatexOptions } from 'katex';
import '@/styles/mathtext.css';

type Render = (tex: string, options?: KatexOptions) => string;

let render: Render | null = null;
let loading: Promise<Render> | null = null;

function loadKatex(): Promise<Render> {
  if (!loading) {
    loading = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([mod]) => {
      render = mod.default.renderToString;
      return render;
    });
  }
  return loading;
}

const MARKED = /\\\((.*?)\\\)|\\\[(.*?)\\\]/gs;

export type MathPiece = { math: false; text: string } | { math: true; tex: string; display: boolean };

/** Splits a string on its math markers. Exported for the tests. */
export function splitMath(text: string): MathPiece[] {
  const pieces: MathPiece[] = [];
  let at = 0;
  for (const match of text.matchAll(MARKED)) {
    const start = match.index ?? 0;
    if (start > at) pieces.push({ math: false, text: text.slice(at, start) });
    const display = match[2] !== undefined;
    pieces.push({ math: true, tex: (display ? match[2] : match[1]) ?? '', display });
    at = start + match[0].length;
  }
  if (at < text.length) pieces.push({ math: false, text: text.slice(at) });
  return pieces;
}

function Math({ piece, draw }: { piece: Extract<MathPiece, { math: true }>; draw: Render | null }) {
  const html = useMemo(() => {
    if (!draw) return null;
    try {
      // Fractions in a line of text come out too small to read at the size
      // they'd normally get, so they're drawn at full size.
      const tex = piece.tex.includes('\\frac') ? `\\displaystyle ${piece.tex}` : piece.tex;
      return draw(tex, { displayMode: piece.display, throwOnError: true });
    } catch {
      return null;
    }
  }, [draw, piece.tex, piece.display]);
  // Output KaTeX wrote from a string it parsed, with `trust` off, so it can't
  // carry a script or a link. If it can't parse the string, show the string.
  if (html === null) return <span className="mt-raw">{piece.tex}</span>;
  return <span className="mt-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function MathText({ text }: { text: string }) {
  const value = text ?? '';
  const pieces = useMemo(() => splitMath(value), [value]);
  const hasMath = pieces.some((piece) => piece.math);
  const [draw, setDraw] = useState<Render | null>(() => render);

  useEffect(() => {
    if (!hasMath || draw) return;
    let live = true;
    void loadKatex().then((loaded) => {
      if (live) setDraw(() => loaded);
    });
    return () => {
      live = false;
    };
  }, [hasMath, draw]);

  if (!hasMath) return <>{value}</>;
  return (
    <>
      {pieces.map((piece, at) =>
        piece.math ? <Math key={at} piece={piece} draw={draw} /> : <span key={at}>{piece.text}</span>,
      )}
    </>
  );
}
