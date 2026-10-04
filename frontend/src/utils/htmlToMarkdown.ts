/**
 * The way back: the rendered note, as the Markdown it came from.
 *
 * ## Why this exists
 *
 * The notes page used to edit its own source. You typed into a `<textarea>`
 * holding the note exactly as the database holds it, which meant the toolbar
 * could be honest — every button wrote something a person could have typed —
 * and it meant the writer looked at `[Revise integrals]{red s20}` while
 * writing the words "Revise integrals". The syntax was on screen for the one
 * person who had no use for it.
 *
 * So the editor renders now, and this is what makes that affordable. It is
 * `utils/markdown` run backwards: the editable surface holds the HTML that
 * `render` produced, the reader formats it with the caret rather than with
 * punctuation, and on every keystroke the DOM is read back into the Markdown
 * that goes in the `body` column. Nothing about the storage changed. A note is
 * still plain text, still readable as itself, still openable in any window
 * that can show a string — which was the property the whole page was built on
 * and the one a rich-text document model would have spent.
 *
 * ## The pair has to agree, and only one of them is a parser
 *
 * `render` is a parser and this is a serialiser, and a round trip is only
 * lossless if every shape one can emit is a shape the other can read. That is
 * why this file emits *nothing* the toolbar cannot also write, and why the
 * class-to-token direction is `TOKEN_OF_CLASS` in utils/markdown rather than a
 * second table here: two tables is two things that can drift, and the drift
 * shows up as a note that changes the moment somebody opens it.
 *
 * `markdown.roundTrip.test.ts` is the guard — it renders, serialises, and
 * renders again, and the two HTMLs have to match.
 *
 * ## What the browser puts in the way
 *
 * A `contenteditable` is not a document anybody wrote. Typing into one makes
 * `<div>`s where paragraphs were, `<br>` where an empty line was meant, `<b>`
 * where `execCommand` was asked for bold, and, depending on the browser and
 * what was pasted, a `style` attribute saying the same thing in CSS. All of
 * those mean something in a note and none of them come from `render`, so each
 * is read here as the mark it stands for rather than dropped. Anything left
 * over is unwrapped to its text: an unknown element is a thing the note cannot
 * say, and the words inside it are worth more than the tag around it.
 */
import { TOKEN_OF_CLASS } from './markdown';

/** Blocks in the order a line of a note can be one of them. */
const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 4, h6: 4 };

/** Line alignment, back from the class `render` gave it. */
const ALIGN_OF_CLASS: Record<string, string> = {
  'md-a-left': 'left',
  'md-a-center': 'center',
  'md-a-right': 'right',
};

/**
 * Text, with the characters that would otherwise be punctuation taken out of
 * service.
 *
 * Conservative on purpose. A note is meant to stay readable as itself, and a
 * serialiser that escapes every character it has ever heard of turns "a * b"
 * into "a \* b" in the database for no reader's benefit. So the rule is: a
 * character is escaped when the renderer would actually consume it.
 *
 * - `\` first, always — everything below depends on it meaning one thing.
 * - `` ` ``, `*` and `[`: single occurrences are enough for the renderer to
 *   pair up or to open a span, and nothing here can see the rest of the line's
 *   future to know whether it will.
 * - `_`, `~` and `=` only doubled, because only doubled is a mark. `snake_case`
 *   survives with its underscore, which is the whole reason for the split.
 * - `{` only where a `{...}` would be read: at the end of a line, where an
 *   alignment lives, and straight after a `]`, where a span's tokens do.
 */
export function harden(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([`*[\]])/g, '\\$1')
    .replace(/(__|~~|==)/g, (pair) => `\\${pair[0]}${pair.slice(1)}`)
    .replace(/\{([^}\n]*)\}\s*$/, '\\{$1}');
}

/**
 * The same, for the first character of a line.
 *
 * `- ` at the front of a paragraph is a bullet and `## ` is a heading, and
 * somebody who typed either as prose meant neither. Only the front of the line
 * is at risk — a dash in the middle of a sentence is a dash — so only the
 * front is touched.
 */
function hardenStart(line: string): string {
  /* A list marker is a run of characters and only one of them can carry the
     escape. For `- ` and `## ` that is the first, which is punctuation and is
     a character `render` knows how to unescape. For `1. ` it is emphatically
     not: `\1` is a backslash in front of a digit, which the renderer has no
     rule for and would print. So the numbered and lettered markers are broken
     at their dot instead — `1\. ` — which stops the list rule matching and
     unescapes back to the text somebody actually typed. */
  const counted = /^(\s*)(\d+|[A-Za-z])([.)]\s)/.exec(line);
  if (counted) {
    return `${counted[1]}${counted[2]}\\${counted[3]}${line.slice(counted[0].length)}`;
  }
  return line.replace(/^(\s*)(#{1,6}\s|>|[-+]\s|---)/, '$1\\$2');
}

/** Whether an element carries a class, tolerating the ones with none. */
const has = (node: Element, name: string): boolean => node.classList.contains(name);

/**
 * The `[text]{...}` tokens an element stands for, if any.
 *
 * Reads the classes `render` wrote, and also the inline styles a browser
 * writes when something is pasted in from elsewhere. A span with no class this
 * app knows is not a span: it comes back as its own text, which is what keeps
 * a paste from a web page out of the note's formatting.
 */
function tokensOf(node: Element): string[] {
  const found: string[] = [];
  for (const css of Array.from(node.classList)) {
    const token = TOKEN_OF_CLASS[css];
    if (token) found.push(token);
  }
  return found;
}

/** `**`, `*`, `__`, `~~` — the mark an element is, when it is one of those. */
function markOf(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const style = (node as HTMLElement).style;
  if (tag === 'strong' || tag === 'b') return '**';
  if (tag === 'em' || tag === 'i') return '*';
  if (tag === 'u') return '__';
  if (tag === 's' || tag === 'strike' || tag === 'del') return '~~';
  // What a browser writes instead, when it writes CSS rather than a tag.
  if (/^(bold|[6-9]00)$/.test(style?.fontWeight ?? '')) return '**';
  if (style?.fontStyle === 'italic') return '*';
  if ((style?.textDecoration ?? '').includes('line-through')) return '~~';
  if ((style?.textDecoration ?? '').includes('underline')) return '__';
  return '';
}

/**
 * Everything inside one block, as the marks that produce it.
 *
 * `<br>` becomes a newline rather than a space: an empty line is how somebody
 * ends a paragraph in an editor that has no other way to say so, and the
 * caller splits on it to get the lines back.
 */
function inlineOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return harden(node.nodeValue ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const inner = () => Array.from(element.childNodes).map(inlineOf).join('');

  if (tag === 'br') return '\n';
  // Drawn by the renderer, not typed by anybody. The `li` writer puts the
  // checkbox back; here it is furniture and contributes nothing.
  if (tag === 'span' && has(element, 'md-box')) return '';
  if (tag === 'code') return `\`${element.textContent ?? ''}\``;

  if (tag === 'a') {
    const href = element.getAttribute('href') ?? '';
    const label = inner();
    return href ? `[${label}](${href})` : label;
  }

  if (tag === 'mark') {
    const tokens = tokensOf(element);
    // The eraser takes the class off rather than retagging the element, so a
    // `<mark>` with nothing left on it is text that used to be highlighted.
    if (tokens.length === 0) return inner();
    // `==` is the shorthand for the yellow one and the only highlight that has
    // one, so anything else has to go back as the span it came from.
    return tokens.length === 1 && tokens[0] === 'bg-yellow'
      ? `==${inner()}==`
      : `[${inner()}]{${tokens.join(' ')}}`;
  }

  const mark = markOf(element);
  if (mark) return `${mark}${inner()}${mark}`;

  const tokens = tokensOf(element);
  if (tokens.length > 0) return `[${inner()}]{${tokens.join(' ')}}`;

  return inner();
}

/** ` {center}`, or nothing, for a block that carries an alignment. */
function alignOf(node: Element): string {
  for (const css of Array.from(node.classList)) {
    const at = ALIGN_OF_CLASS[css];
    if (at) return ` {${at}}`;
  }
  return '';
}

/**
 * One block's lines, with `indent` spaces on the front of each.
 *
 * Lines rather than a string because a `<br>` inside a paragraph is a second
 * line of the same block, and the front-of-line escaping has to run over each
 * of them rather than over the first.
 */
function linesOf(text: string, indent: string): string[] {
  return text.split('\n').map((line) => indent + hardenStart(line));
}

/** A list's items, and any list nested under them. See `blockOf`. */
function listLines(node: Element, depth: number, out: string[]): void {
  const ordered = node.tagName.toLowerCase() === 'ol';
  const type = node.getAttribute('type') ?? '1';
  let count = 0;

  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();

    if (tag === 'ul' || tag === 'ol') {
      // `render` emits a nested list as a *sibling* of the item above it, and
      // a browser will happily put one inside the `<li>` instead. Both are the
      // same list one level in, so both are followed the same way.
      listLines(child, depth + 1, out);
      continue;
    }
    if (tag !== 'li') continue;

    count += 1;
    const marker = ordered ? `${counter(type, count)}. ` : '- ';
    const indent = '  '.repeat(depth);

    // A checklist is a bulleted list whose items open with a box.
    const box = child.firstElementChild;
    const ticked = box && box.tagName.toLowerCase() === 'span' && has(box, 'md-box')
      ? (has(box, 'is-on') ? '[x] ' : '[ ] ')
      : '';

    const nested: Element[] = [];
    const own = Array.from(child.childNodes).filter((part) => {
      const name = part.nodeType === Node.ELEMENT_NODE
        ? (part as Element).tagName.toLowerCase()
        : '';
      if (name === 'ul' || name === 'ol') {
        nested.push(part as Element);
        return false;
      }
      return true;
    });

    const body = own.map(inlineOf).join('').trim();
    const align = alignOf(child);
    out.push(`${indent}${marker}${ticked}${hardenStart(body)}${align}`);
    for (const list of nested) listLines(list, depth + 1, out);
  }
}

/**
 * An ordered list's marker at position `n`, in the numbering the list uses.
 *
 * The renderer reads `1.`, `a.`, `i.` and the capitals back into the same four
 * kinds, so writing the list out in its own numbering is what makes a lettered
 * list still lettered after it has been saved.
 */
function counter(type: string, n: number): string {
  if (type === 'a' || type === 'A') {
    const letter = String.fromCharCode(97 + ((n - 1) % 26));
    return type === 'A' ? letter.toUpperCase() : letter;
  }
  if (type === 'i' || type === 'I') {
    const roman = toRoman(n);
    return type === 'I' ? roman.toUpperCase() : roman;
  }
  return String(n);
}

const ROMAN: Array<[number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

function toRoman(n: number): string {
  let left = n;
  let out = '';
  for (const [value, sign] of ROMAN) {
    while (left >= value) {
      out += sign;
      left -= value;
    }
  }
  return out;
}

/** One top-level node, as the lines of the note it stands for. */
function blockOf(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? '';
    // Whitespace between two blocks is the gap between them, not a paragraph.
    if (text.trim()) out.push(...linesOf(harden(text), ''));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  const tag = element.tagName.toLowerCase();

  if (tag === 'br') {
    out.push('');
    return;
  }
  if (tag === 'hr') {
    out.push('---');
    return;
  }
  if (tag === 'pre') {
    out.push('```', ...(element.textContent ?? '').replace(/\n$/, '').split('\n'), '```');
    return;
  }
  if (tag === 'ul' || tag === 'ol') {
    listLines(element, 0, out);
    return;
  }
  if (tag === 'blockquote') {
    for (const line of linesOf(inlineOf(element), '')) out.push(`> ${line}`);
    return;
  }

  const level = HEADINGS[tag];
  if (level) {
    out.push(`${'#'.repeat(level)} ${inlineOf(element).trim()}${alignOf(element)}`);
    return;
  }

  if (tag === 'p' || tag === 'div') {
    const text = inlineOf(element);
    // An empty `<div>` is the blank line somebody pressed Return for; a `<div>`
    // holding only a `<br>` is the same thing as the browser writes it.
    if (!text.trim()) {
      out.push('');
      return;
    }
    const align = alignOf(element);
    const lines = linesOf(text, '');
    lines[lines.length - 1] += align;
    out.push(...lines);
    return;
  }

  // Not a block this note can say. Its children still might be.
  const children = Array.from(element.childNodes);
  if (children.length === 0) return;
  const inline = inlineOf(element);
  if (inline.trim()) out.push(...linesOf(inline, ''));
}

/**
 * The note, as Markdown, read out of the element the editor is holding.
 *
 * Blank lines are collapsed to at most one, because a paragraph break in the
 * source is one blank line and a `contenteditable` will cheerfully produce
 * four of them from a held-down Return key. Leading and trailing blanks go for
 * the same reason: they are invisible in the editor and would otherwise grow
 * by one every time the note was opened and saved.
 */
export function toMarkdown(root: HTMLElement): string {
  const out: string[] = [];
  for (const node of Array.from(root.childNodes)) blockOf(node, out);

  const tidy: string[] = [];
  for (const line of out) {
    if (line.trim() === '' && (tidy.length === 0 || tidy[tidy.length - 1]!.trim() === '')) continue;
    tidy.push(line);
  }
  while (tidy.length > 0 && tidy[tidy.length - 1]!.trim() === '') tidy.pop();
  return tidy.join('\n');
}
