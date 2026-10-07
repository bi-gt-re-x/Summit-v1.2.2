/**
 * Bold and italic inside a block — stored as inline Markdown, edited as runs.
 *
 * A block's `text` is Markdown of exactly three kinds: `**bold**`, `*italic*`
 * and `***both***`, with `\*` and `\\` for a literal star or backslash. That
 * keeps a page one string per block, the plain-text `body` the server writes
 * readable, and a page written before formatting existed already valid.
 *
 * Editing works on runs instead — pieces of text that are all bold, all
 * italic, both or neither — and on offsets into the *visible* text, the words
 * without their stars. Every edit the block editor makes (split at the caret,
 * join two blocks, cut out a "/" command, bold a selection) is one of the
 * functions here, so no caller ever counts stars.
 *
 * The parser is forgiving rather than strict: a marker with no partner is a
 * literal star, so "5 * 3" written before any of this stays "5 * 3".
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Mark = 'bold' | 'italic';

type Token = { char: string } | { marker: '**' | '*'; at: number };

/** Markdown into runs. */
export function parseInline(md: string): Run[] {
  const tokens: Token[] = [];
  const source = md ?? '';
  for (let i = 0; i < source.length; ) {
    if (source[i] === '\\' && i + 1 < source.length) {
      tokens.push({ char: source[i + 1]! });
      i += 2;
    } else if (source.startsWith('**', i)) {
      tokens.push({ marker: '**', at: tokens.length });
      i += 2;
    } else if (source[i] === '*') {
      tokens.push({ marker: '*', at: tokens.length });
      i += 1;
    } else {
      tokens.push({ char: source[i]! });
      i += 1;
    }
  }

  // A marker counts only with a partner: pair them in order, and an odd one
  // out (the last) is a literal star.
  const literal = new Set<number>();
  for (const kind of ['**', '*'] as const) {
    const at = tokens.flatMap((token, index) => ('marker' in token && token.marker === kind ? [index] : []));
    if (at.length % 2 === 1) literal.add(at[at.length - 1]!);
  }

  const runs: Run[] = [];
  let bold = false;
  let italic = false;
  const push = (text: string) => {
    const last = runs[runs.length - 1];
    if (last && Boolean(last.bold) === bold && Boolean(last.italic) === italic) last.text += text;
    else runs.push(flags(text, bold, italic));
  };
  tokens.forEach((token, index) => {
    if ('char' in token) push(token.char);
    else if (literal.has(index)) push(token.marker);
    else if (token.marker === '**') bold = !bold;
    else italic = !italic;
  });
  return normaliseRuns(runs);
}

function flags(text: string, bold?: boolean, italic?: boolean): Run {
  const run: Run = { text };
  if (bold) run.bold = true;
  if (italic) run.italic = true;
  return run;
}

/** Adjacent runs with the same marks merged, empty ones dropped. */
export function normaliseRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = out[out.length - 1];
    if (last && Boolean(last.bold) === Boolean(run.bold) && Boolean(last.italic) === Boolean(run.italic)) {
      last.text += run.text;
    } else {
      out.push(flags(run.text, run.bold, run.italic));
    }
  }
  return out;
}

/** A literal string as Markdown: its stars and backslashes escaped. */
export const escapeInline = (text: string): string => text.replace(/[\\*]/g, (char) => `\\${char}`);

/**
 * Runs back into Markdown, writing only what changes between one run and
 * the next — `**` where bold turns on or off, `*` where italic does. Wrapping
 * each run on its own would put a closing `***` against an opening `*`, and
 * `****` reads back as bold toggled twice. A change of both is `***`, which
 * reads as `**` then `*`; the order does not matter, since each only flips.
 * Everything opened is closed at the end, so any two results concatenate.
 */
export function serialize(runs: Run[]): string {
  let out = '';
  let bold = false;
  let italic = false;
  const toggle = (nextBold: boolean, nextItalic: boolean) => {
    if (nextBold !== bold) out += '**';
    if (nextItalic !== italic) out += '*';
    bold = nextBold;
    italic = nextItalic;
  };
  for (const run of normaliseRuns(runs)) {
    toggle(Boolean(run.bold), Boolean(run.italic));
    out += escapeInline(run.text);
  }
  toggle(false, false);
  return out;
}

/** The words, without the stars. */
export const plainOf = (md: string): string => parseInline(md).map((run) => run.text).join('');

/** The runs between two visible offsets. */
export function sliceRuns(runs: Run[], from: number, to = Infinity): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    const end = at + run.text.length;
    const start = Math.max(from, at);
    const stop = Math.min(to, end);
    if (stop > start) out.push(flags(run.text.slice(start - at, stop - at), run.bold, run.italic));
    at = end;
  }
  return out;
}

/** The Markdown for a stretch of the visible text. */
export const sliceInline = (md: string, from: number, to?: number): string =>
  serialize(sliceRuns(parseInline(md), from, to));

/** Replace a stretch of the visible text with plain `insert`. */
export function spliceInline(md: string, from: number, to: number, insert = ''): string {
  const runs = parseInline(md);
  return serialize([...sliceRuns(runs, 0, from), { text: insert }, ...sliceRuns(runs, to)]);
}

/** Two blocks' words as one. */
export const joinInline = (a: string, b: string): string => serialize([...parseInline(a), ...parseInline(b)]);

/** Turn a mark on or off across a stretch of the visible text. */
export function setMark(md: string, from: number, to: number, mark: Mark, on: boolean): string {
  const runs = parseInline(md);
  const middle = sliceRuns(runs, from, to).map((run) => {
    const next = { ...run };
    if (on) next[mark] = true;
    else delete next[mark];
    return next;
  });
  return serialize([...sliceRuns(runs, 0, from), ...middle, ...sliceRuns(runs, to)]);
}

/** Whether every character in the stretch carries the mark. False for an empty stretch. */
export function hasMark(md: string, from: number, to: number, mark: Mark): boolean {
  const middle = sliceRuns(parseInline(md), from, to);
  return middle.length > 0 && middle.every((run) => run[mark]);
}

/**
 * Typed Markdown, formatted as it is finished: "**word**" becomes bold and
 * "*word*" italic the moment the closing star goes in, the way Notion does
 * it. The stars arrive as literal text (the field shows what was typed), so
 * this reads the visible text before the caret. Null when nothing closed;
 * otherwise the new text, the caret after the formatted word, and the mark —
 * which the editor then turns off for what is typed next.
 */
export function autoFormat(md: string, caret: number): { text: string; caret: number; mark: Mark } | null {
  const before = plainOf(md).slice(0, caret);
  // The word inside starts and ends on something that is neither a space
  // nor a star, so "**a*" is not an italic star and "a * b *" not a word.
  const bold = /\*\*([^*\s](?:[^*\n]*[^*\s])?)\*\*$/.exec(before);
  const italic = bold ? null : /(^|[^*])\*([^*\s](?:[^*\n]*[^*\s])?)\*$/.exec(before);
  const hit = bold ?? italic;
  if (!hit) return null;
  const inner = bold ? hit[1]! : hit[2]!;
  const stars = bold ? 2 : 1;
  const start = caret - inner.length - 2 * stars;
  let text = spliceInline(md, caret - stars, caret);
  text = spliceInline(text, start, start + stars);
  text = setMark(text, start, start + inner.length, bold ? 'bold' : 'italic', true);
  return { text, caret: start + inner.length, mark: bold ? 'bold' : 'italic' };
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const html = (text: string) => text.replace(/[&<>"]/g, (char) => ENTITIES[char]!);

/**
 * Markdown as the HTML an editable block shows. Line breaks stay as "\n"
 * under `white-space: pre-wrap`; a block ending in one gets a <br> after it,
 * or the browser would not draw the empty last line.
 */
export function toHtml(md: string): string {
  const runs = parseInline(md);
  const body = runs
    .map((run) => {
      let out = html(run.text);
      if (run.italic) out = `<em>${out}</em>`;
      if (run.bold) out = `<strong>${out}</strong>`;
      return out;
    })
    .join('');
  return plainOf(md).endsWith('\n') ? `${body}<br>` : body;
}
