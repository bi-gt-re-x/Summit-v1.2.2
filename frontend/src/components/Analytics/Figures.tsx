/**
 * A sentence with its figures in bold: the change and the size of it are what a
 * reader skims for, and they arrive from the server inside plain text. `every` also
 * bolds plain counts, for a line that's nothing but figures.
 */
const FIGURE = /(\d[\d,.]*\s*→\s*\d[\d,.]*|(?<![\w.])[+−-]\d[\d,.]*[a-z%]*|\d[\d,.]*%)/;
const EVERY = /(\d[\d,.]*\s*→\s*\d[\d,.]*|(?<![\w.])[+−-]\d[\d,.]*[a-z%]*|(?<![\w.])\d[\d,]*(?:\.\d+)?%?)/;

export function Figures({ text, every = false }: { text: string; every?: boolean }) {
  return (
    <>
      {text.split(every ? EVERY : FIGURE).map((part, at) => (at % 2 ? <strong key={at}>{part}</strong> : part))}
    </>
  );
}
