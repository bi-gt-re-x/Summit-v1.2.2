/**
 * The small Markdown the notes page reads back.
 *
 * ## Why a subset, and why written here
 *
 * The notes toolbar writes Markdown into a plain-text column (see
 * pages/Notes.tsx) — which keeps a note readable as itself, in the database
 * and in any other window it is ever opened in. The cost of that choice is
 * that something has to turn it back into headings, and this is that
 * something.
 *
 * It covers exactly what the toolbar can write and nothing else. A general
 * Markdown library is tens of kilobytes to render six constructs, and every
 * one it adds beyond them is a construct the toolbar gives nobody a way to
 * produce.
 *
 * ## Colour, highlight and font, without leaving plain text
 *
 * The page grew a Google-Docs-shaped toolbar — colours, highlighters, fonts,
 * alignment — and none of that is expressible in the six constructs this
 * started with. The alternative was a rich-text document model, which is a
 * migration and which throws away the property the whole design is built on:
 * a note stays readable as itself, in the database and in any window that
 * opens it.
 *
 * So the attributes go in the text, in one syntax: `[text]{tokens}`. Braces
 * rather than the parentheses a link uses, so the two cannot collide, and
 * space-separated tokens so one span can be red, serif and highlighted at
 * once. It is Pandoc's bracketed span with a smaller vocabulary.
 *
 * **Only known tokens are honoured.** `TOKENS` is a fixed map from a word to
 * one class, anything not in it is dropped, and nothing from the note ever
 * reaches a class attribute unmapped. A renderer that passed tokens through
 * would be letting a note body write its own CSS classes, which is a smaller
 * hole than innerHTML and is still a hole.
 *
 * `==highlight==` and `~~strike~~` are the two marks common enough to deserve
 * their own punctuation; both are the usual Markdown extensions for them.
 *
 * ## Escaping comes first, always
 *
 * A note body is text the account typed, and it is about to become innerHTML.
 * So `escape` runs over the whole string before a single rule does, and every
 * rule after it emits its own tags into already-safe text. Getting that order
 * wrong is the difference between a renderer and an XSS hole, which is why it
 * is one call at the top of `render` rather than a step each rule remembers.
 *
 * Link targets are the one place escaping is not enough: `javascript:` in an
 * `[a](b)` is still a script after the angle brackets are gone. `_href` allows
 * http, https, mailto and same-page anchors, and drops everything else.
 */

const ESCAPES: Array<[RegExp, string]> = [
  [/&/g, '&amp;'],
  [/</g, '&lt;'],
  [/>/g, '&gt;'],
  [/"/g, '&quot;'],
];

export function escape(text: string): string {
  return ESCAPES.reduce((out, [pattern, to]) => out.replace(pattern, to), text);
}

/** A link target, or '' for one that is not allowed. See the docstring. */
function _href(raw: string): string {
  const url = raw.trim();
  return /^(https?:\/\/|mailto:|#|\/)/i.test(url) ? url : '';
}

/**
 * What a link points at: somewhere in this app, or the web.
 *
 * Derived from the path rather than written into the note, which is the whole
 * reason the syntax did not have to change to get task and goal links. A note
 * still says `[Revise integrals](/tasks?task=a1b2)` — ordinary Markdown that
 * means something in any window that opens it — and the kind is read back off
 * the route the same way the router reads it.
 *
 * `escape` has already run by the time this sees a target, so a second
 * parameter arrives as `&amp;` rather than `&`. Both spellings are allowed
 * for, because the alternative is a classifier that works today and stops the
 * first time a link carries two parameters.
 */
export type LinkKind = 'task' | 'goal' | 'page' | 'external';

export function linkKind(url: string): LinkKind {
  if (/^(https?:\/\/|mailto:)/i.test(url)) return 'external';
  if (/^\/tasks\?(?:[^#]*(?:&|&amp;))?task=/.test(url)) return 'task';
  if (/^\/goals\?(?:[^#]*(?:&|&amp;))?goal=/.test(url)) return 'goal';
  return 'page';
}

/**
 * The words a `{...}` may contain, and the one class each becomes.
 *
 * A fixed map rather than a pattern, because the value here is not the
 * shortness of the table — it is that a token the account invents cannot
 * become a class. Everything unknown is dropped silently: a note that says
 * `{plaid}` renders as text without the mark, which is the failure a reader
 * can see and correct.
 *
 * The colours are the palette the rest of the page already uses, named rather
 * than given as hex, so a note written today still matches the theme after the
 * palette moves and in dark mode where the same names resolve differently.
 */
const TOKENS: Record<string, string> = {
  // Ink
  red: 'md-c-red', orange: 'md-c-orange', yellow: 'md-c-yellow',
  green: 'md-c-green', teal: 'md-c-teal', blue: 'md-c-blue',
  violet: 'md-c-violet', pink: 'md-c-pink', grey: 'md-c-grey', gray: 'md-c-grey',
  // Highlighter
  'bg-red': 'md-b-red', 'bg-orange': 'md-b-orange', 'bg-yellow': 'md-b-yellow',
  'bg-green': 'md-b-green', 'bg-teal': 'md-b-teal', 'bg-blue': 'md-b-blue',
  'bg-violet': 'md-b-violet', 'bg-pink': 'md-b-pink', 'bg-grey': 'md-b-grey',
  // Face. Each is a real family fetched in index.html, not a system fallback.
  sans: 'md-f-sans', serif: 'md-f-serif', mono: 'md-f-mono',
  display: 'md-f-display', hand: 'md-f-hand',
  // Size, in points, the way a size selector states one. `sm`/`lg`/`xl` were
  // here first and are kept: notes written against them still read back.
  s12: 'md-s-12', s14: 'md-s-14', s16: 'md-s-16', s18: 'md-s-18',
  s20: 'md-s-20', s24: 'md-s-24', s30: 'md-s-30', s36: 'md-s-36', s48: 'md-s-48',
  sm: 'md-s-14', lg: 'md-s-20', xl: 'md-s-30',
};

/**
 * Class back to token, for the editor that has to write Markdown out of HTML.
 *
 * Built from `TOKENS` rather than typed twice: the two have to agree for a
 * note to survive being opened, formatted and saved, and a second literal is
 * the thing that eventually disagrees. Aliases collapse — `gray` and `grey`
 * are one class, and it comes back as whichever name the table reaches last,
 * which is the point at which the spelling stops mattering.
 */
export const TOKEN_OF_CLASS: Record<string, string> = Object.fromEntries(
  Object.entries(TOKENS).map(([token, css]) => [css, token]),
);

/** The same, for a whole line: alignment is not a thing a span can be. */
const BLOCK_TOKENS: Record<string, string> = {
  left: 'md-a-left', center: 'md-a-center', centre: 'md-a-center', right: 'md-a-right',
};

/** `red serif plaid` → `md-c-red md-f-serif`. Unknown words are dropped. */
function classesFor(raw: string, table: Record<string, string>): string {
  const seen = new Set<string>();
  for (const word of raw.trim().toLowerCase().split(/[\s,]+/)) {
    const found = table[word];
    if (found) seen.add(found);
  }
  return [...seen].join(' ');
}

/**
 * Where a stretch of code is parked while the other marks are applied.
 *
 * A control character, so it cannot appear in a note: anything the account can
 * actually type would let them collide with the placeholder on purpose.
 */
const HOLD = '\u0000';

/**
 * The marks that live inside a line: bold, italic, underline, strike,
 * highlight, code, links, and the attributed span.
 *
 * Code is taken first and its content is not re-scanned, so `**x**` inside
 * backticks stays as it was typed — the one nesting rule that actually comes
 * up when somebody writes about writing.
 *
 * The span runs before the link, and both are anchored to their own closing
 * punctuation — `]{...}` against `](...)` — so `[a](b)` is never read as a
 * span and `[a]{red}` is never read as a link. A span whose tokens are all
 * unknown emits no element at all rather than an empty one: the words come
 * through as they were typed, which is what a reader needs to see to fix it.
 */
function inline(text: string): string {
  const code: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_whole, held: string) => {
    code.push(held);
    return `${HOLD}${code.length - 1}${HOLD}`;
  });

  /* A backslash takes the meaning off the character after it, and the
     character is parked so that no rule below can see it. Without this there
     is no way to write about the syntax in the syntax — and, more to the
     point, no way for the editor to write a note back out: somebody who types
     a literal `**` into the rich editor has to get `\*\*` in the note, or it
     comes back as bold the next time the note is opened.

     The entities are in the list because `escape` has already run: a `\>` is
     `\&gt;` by the time it reaches here, and matching only the bare `>` would
     leave the backslash on screen. */
  const literal: string[] = [];
  out = out.replace(
    /\\(&(?:gt|lt|amp|quot);|[\\*_~=`[\]{}()#>+.!|-])/g,
    (_whole, held: string) => {
      literal.push(held);
      return `${HOLD}L${literal.length - 1}${HOLD}`;
    },
  );

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/==([^=]+)==/g, '<mark class="md-b-yellow">$1</mark>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\{([^}\n]*)\}/g, (whole, label: string, raw: string) => {
      const classes = classesFor(raw, TOKENS);
      return classes ? `<span class="${classes}">${label}</span>` : whole;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, target: string) => {
      const href = _href(target);
      if (!href) return whole;
      const kind = linkKind(href);
      /* An address on the web leaves the app, so it opens away from it. A
         route does not: `target="_blank"` on `/tasks` threw away the single
         page the whole app is, reloading React to show a page it was already
         holding. `data-nav` is what the notes page hands to the router; the
         `href` stays real so the link can still be copied and middle-clicked. */
      return kind === 'external'
        ? `<a class="md-link is-external" href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`
        : `<a class="md-link is-${kind}" href="${href}" data-nav="${href}">${label}</a>`;
    });

  const holder = new RegExp(`${HOLD}(\\d+)${HOLD}`, 'g');
  out = out.replace(holder, (_whole, index: string) => `<code>${code[Number(index)]}</code>`);

  const held = new RegExp(`${HOLD}L(\\d+)${HOLD}`, 'g');
  return out.replace(held, (_whole, index: string) => literal[Number(index)]!);
}

/**
 * A line's own attributes, written at its end: `A title {center}`.
 *
 * Alignment cannot be a span — half a centred paragraph is not a thing — so it
 * is read off the line before the line is classified, and the block rule that
 * claims the line puts the class on whatever element it emits. Unknown tokens
 * leave the braces in the text, same as a span.
 */
function lineAttrs(line: string): { text: string; classes: string } {
  const found = /^(.*?)\s*\{([^}]*)\}\s*$/.exec(line);
  if (!found) return { text: line, classes: '' };
  const classes = classesFor(found[2]!, BLOCK_TOKENS);
  return classes ? { text: found[1]!, classes } : { text: line, classes: '' };
}

/** ` class="..."`, or nothing at all. Keeps the emitters free of blank attrs. */
const attr = (classes: string): string => (classes ? ` class="${classes}"` : '');

/**
 * What kind of ordered list a marker opens.
 *
 * Roman is tested before the single letter, so `i.` is one and `a.` is not —
 * which is the convention every outline uses and the one thing a reader would
 * be surprised to get wrong. `v.` and `x.` go the same way, and that is the
 * cost of the convention rather than a bug in it.
 */
function orderedType(marker: string): string | null {
  if (/^\d+$/.test(marker)) return '1';
  if (/^[ivxlcdm]+$/.test(marker)) return 'i';
  if (/^[IVXLCDM]+$/.test(marker)) return 'I';
  if (/^[a-z]$/.test(marker)) return 'a';
  if (/^[A-Z]$/.test(marker)) return 'A';
  return null;
}

/** One list item's text, with a checkbox in front of it when it had one. */
function item(text: string): string {
  const box = /^\[([ xX])\]\s+/.exec(text);
  if (!box) return inline(text);
  const ticked = box[1]!.toLowerCase() === 'x';
  return (
    `<span class="md-box${ticked ? ' is-on' : ''}" aria-hidden="true"></span>` +
    `<span${ticked ? ' class="md-done"' : ''}>${inline(text.slice(box[0].length))}</span>`
  );
}

/**
 * Markdown to HTML, for the notes preview.
 *
 * One pass over the lines, and the only state is the stack of lists currently
 * open. It was a single `open` variable, which is exactly as much state as a
 * flat list needs and one short of what a nested one does — a sub-list has to
 * remember what it is inside to know what to close when the indent comes back
 * out. Depth is two spaces, or a tab, and is rounded down, so a line indented
 * by three is a child rather than an error.
 */
export function render(source: string): string {
  const safe = escape(source);
  const out: string[] = [];
  /** Lists currently open, outermost first. `pre` is separate — it nests in nothing. */
  const stack: Array<{ tag: 'ul' | 'ol'; depth: number }> = [];
  let pre = false;

  /** Close lists until the innermost one is at `depth` or shallower. */
  const closeTo = (depth: number) => {
    while (stack.length > 0 && stack[stack.length - 1]!.depth > depth) {
      out.push(`</${stack.pop()!.tag}>`);
    }
  };
  const closeAll = () => closeTo(-1);

  for (const raw of safe.split('\n')) {
    // A fence swallows everything until the next one, formatting nothing.
    if (/^\s*```/.test(raw)) {
      if (pre) {
        out.push('</pre>');
        pre = false;
      } else {
        closeAll();
        out.push('<pre>');
        pre = true;
      }
      continue;
    }
    if (pre) {
      out.push(raw);
      continue;
    }

    if (raw.trim() === '') {
      closeAll();
      continue;
    }

    /* Depth before anything else: every block rule below matches on the line
       with its indent already taken off, and only the list rules care what the
       indent was. */
    const indent = /^[ \t]*/.exec(raw)![0].replace(/\t/g, '  ').length;
    const depth = Math.floor(indent / 2);
    const line = raw.slice(/^[ \t]*/.exec(raw)![0].length);

    // A rule. Three or more of one mark, and nothing else on the line.
    if (/^([-*_])\1{2,}$/.test(line.replace(/\s+/g, ''))) {
      closeAll();
      out.push('<hr />');
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^([0-9]+|[A-Za-z]+)[.)]\s+(.*)$/.exec(line);
    const orderKind = numbered ? orderedType(numbered[1]!) : null;

    if (bullet || orderKind) {
      const tag = bullet ? 'ul' : 'ol';
      closeTo(depth);
      const top = stack[stack.length - 1];
      /* A new list when there is nothing at this depth, and also when what is
         there is the other kind — "1." directly under "-" is a second list,
         not a numbered item in a bulleted one. */
      if (!top || top.depth < depth || top.tag !== tag) {
        if (top && top.depth === depth) out.push(`</${stack.pop()!.tag}>`);
        out.push(tag === 'ul' ? '<ul>' : `<ol type="${orderKind}">`);
        stack.push({ tag, depth });
      }
      const body = bullet ? bullet[1]! : numbered![2]!;
      const { text, classes } = lineAttrs(body);
      out.push(`<li${attr(classes)}>${bullet ? item(text) : inline(text)}</li>`);
      continue;
    }

    // Everything below is a block of its own and ends any list it follows.
    closeAll();
    const { text, classes } = lineAttrs(line);

    const heading = /^(#{1,4})\s+(.*)$/.exec(text);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}${attr(classes)}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    const quote = /^&gt;\s?(.*)$/.exec(text);
    if (quote) {
      out.push(`<blockquote${attr(classes)}>${inline(quote[1]!)}</blockquote>`);
      continue;
    }

    out.push(`<p${attr(classes)}>${inline(text)}</p>`);
  }

  if (pre) out.push('</pre>');
  closeAll();
  return out.join('\n');
}
