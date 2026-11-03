/**
 * A sentence with its figures in bold: the change and the size of it are what a
 * reader skims for, and they arrive from the server inside plain text.
 */
const FIGURE = /(\d[\d,.]*\s*→\s*\d[\d,.]*|[+−-]\d[\d,.]*[a-z%]*|\d[\d,.]*%)/;

export function Figures({ text }: { text: string }) {
  return (
    <>
      {text.split(FIGURE).map((part, at) => (at % 2 ? <strong key={at}>{part}</strong> : part))}
    </>
  );
}
