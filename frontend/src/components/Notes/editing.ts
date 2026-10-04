/**
 * What the notes toolbar does to a selection, now that the selection is in a
 * document rather than in a string.
 *
 * ## Why this replaced string arithmetic
 *
 * Every button on this toolbar used to be an edit to the note's source: bold
 * put two asterisks either side of `selectionStart..selectionEnd`, and the
 * reader watched the asterisks appear. The editor renders now (see
 * `RichEditor`), so the same buttons work on ranges in the DOM, and the note's
 * source is derived from the result rather than typed into.
 *
 * ## execCommand, deliberately
 *
 * It is deprecated, it is implemented by every browser this app runs in, and
 * the alternative is a range-splitting library for the five marks it already
 * gets right. What it is *not* trusted with is anything with a vocabulary of
 * ours — colour, highlighter, face, size, alignment — because those are our
 * classes and `execCommand` would write its own CSS. `styleWithCSS` is turned
 * off for the same reason: it makes `<b>` rather than a styled `<span>`, and
 * `<b>` is a thing utils/htmlToMarkdown can name.
 *
 * Everything here is a no-op when the selection is not inside `root`. A
 * toolbar press with the caret somewhere else on the page would otherwise
 * format whatever it happened to be in.
 */
import { TOKEN_OF_CLASS } from '@/utils/markdown';

/** The four families a span token belongs to. One of each may apply at once. */
export type Family = 'ink' | 'mark' | 'face' | 'size';

const PREFIX: Record<Family, string> = {
  ink: 'md-c-', mark: 'md-b-', face: 'md-f-', size: 'md-s-',
};

/** Which family a class belongs to, or null for one that is not a span token. */
function familyOf(css: string): Family | null {
  for (const [family, prefix] of Object.entries(PREFIX) as Array<[Family, string]>) {
    if (css.startsWith(prefix)) return family;
  }
  return null;
}

/** The class a token becomes. The inverse of `TOKEN_OF_CLASS`, looked up once. */
const CLASS_OF_TOKEN: Record<string, string> = Object.fromEntries(
  Object.entries(TOKEN_OF_CLASS).map(([css, token]) => [token, css]),
);

/** The live selection, if it is inside `root`. */
function rangeIn(root: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range : null;
}

/** Put the selection back over `node`, which is what every button here does. */
function reselect(node: Node): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * The block elements the selection touches.
 *
 * Alignment and headings belong to a line rather than to a run of characters,
 * so they are applied to every block the selection reaches into — which is
 * what somebody selecting three paragraphs and pressing centre means.
 */
function blocksIn(root: HTMLElement, range: Range): HTMLElement[] {
  const found: HTMLElement[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const element = child as HTMLElement;
      if (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test(element.tagName)) {
        if (range.intersectsNode(element)) found.push(element);
      }
      walk(child);
    }
  };
  walk(root);
  // A selection inside one paragraph reaches no block by the walk above when
  // the editor is holding bare text; the range's own ancestor is the answer.
  if (found.length === 0) {
    let at: Node | null = range.commonAncestorContainer;
    while (at && at !== root) {
      if (at.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test((at as HTMLElement).tagName)) {
        return [at as HTMLElement];
      }
      at = at.parentNode;
    }
  }
  return found;
}

/** Ask the browser for one of the marks it already knows how to toggle. */
function command(root: HTMLElement, name: string, value?: string): void {
  if (!rangeIn(root)) return;
  try {
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(name, false, value);
  } catch {
    // Not available (jsdom, and any browser that has finally dropped it). The
    // note is unchanged, which is the only safe way for a toolbar to fail.
  }
}

export function markSelection(
  root: HTMLElement,
  kind: 'bold' | 'italic' | 'underline' | 'strike',
): void {
  command(root, kind === 'strike' ? 'strikeThrough' : kind);
}

/** `#`..`####`, a quote, or back to a plain line. */
export function blockSelection(root: HTMLElement, tag: string): void {
  command(root, 'formatBlock', tag.toUpperCase());
}

export function listSelection(root: HTMLElement, ordered: boolean, type?: string): void {
  command(root, ordered ? 'insertOrderedList' : 'insertUnorderedList');
  if (!ordered || !type) return;
  // `insertOrderedList` makes a `1.` list and has no opinion about letters or
  // numerals, so the kind is set afterwards on the list the caret is now in.
  const range = rangeIn(root);
  let at: Node | null = range?.commonAncestorContainer ?? null;
  while (at && at !== root) {
    if (at.nodeType === Node.ELEMENT_NODE && (at as HTMLElement).tagName === 'OL') {
      (at as HTMLElement).setAttribute('type', type);
      return;
    }
    at = at.parentNode;
  }
}

export function shiftSelection(root: HTMLElement, into: boolean): void {
  command(root, into ? 'indent' : 'outdent');
}

/** Alignment, as our own class rather than as the browser's inline CSS. */
export function alignSelection(root: HTMLElement, at: 'left' | 'center' | 'right'): void {
  const range = rangeIn(root);
  if (!range) return;
  const wanted = `md-a-${at}`;
  for (const block of blocksIn(root, range)) {
    const had = block.classList.contains(wanted);
    block.classList.remove('md-a-left', 'md-a-center', 'md-a-right');
    // Pressing the alignment a line already has takes it off, which is how
    // every other toggle on this toolbar behaves.
    if (!had) block.classList.add(wanted);
    block.style.removeProperty('text-align');
  }
}

/**
 * The word the caret is sitting in, selected.
 *
 * A font button with nothing selected used to write the word "text" into the
 * note. In an editor that shows the result rather than the source that is
 * worse than it was before — you get the literal word "text", in Lora, in the
 * middle of your sentence. Taking the word under the caret is what somebody
 * pressing a font mid-word actually means, and it leaves the note's own words
 * alone.
 */
function widenToWord(range: Range): Range {
  if (!range.collapsed) return range;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return range;
  const text = node.nodeValue ?? '';
  let from = range.startOffset;
  let to = range.startOffset;
  while (from > 0 && /\S/.test(text[from - 1]!)) from -= 1;
  while (to < text.length && /\S/.test(text[to]!)) to += 1;
  if (from === to) return range;
  const wide = document.createRange();
  wide.setStart(node, from);
  wide.setEnd(node, to);
  return wide;
}

/**
 * Put a colour, a highlighter, a face or a size on the selection.
 *
 * One of each family at a time: applying blue to text that is already red
 * replaces the red rather than leaving a span claiming both, which is what the
 * renderer would otherwise be handed and what a reader would then have to undo
 * twice. Everything of *other* families inside the range is left exactly
 * where it is, so colouring a phrase does not flatten the bold inside it.
 */
/**
 * Take a family off the wrappers the extraction just emptied.
 *
 * `extractContents` takes the *contents* of a range, and a selection that
 * covers a whole coloured phrase covers the text inside the span rather than
 * the span itself. So the old wrapper stays in the document, empty, and the
 * new one goes inside it — which is how applying blue to red text produced
 * text that was both, nested, and why the eraser could not reach a `<mark>`
 * whose text it had just removed.
 *
 * Emptiness is the test, and it is the right one: a wrapper with nothing left
 * in it is one the selection covered completely, so clearing it cannot affect
 * a character the reader did not select. A wrapper with text still in it was
 * only partly covered and is left exactly alone — the new span nests inside
 * it, which reads correctly and comes back out as a nested span.
 */
function peelEmptied(root: HTMLElement, range: Range, family: Family): void {
  let at: Node | null = range.startContainer;
  while (at && at !== root) {
    if (at.nodeType === Node.ELEMENT_NODE) {
      const element = at as HTMLElement;
      if ((element.textContent ?? '') === '') {
        for (const name of Array.from(element.classList)) {
          if (familyOf(name) === family) element.classList.remove(name);
        }
      }
    }
    at = at.parentNode;
  }
}

export function spanSelection(root: HTMLElement, token: string): void {
  const live = rangeIn(root);
  if (!live) return;
  const css = CLASS_OF_TOKEN[token];
  if (!css) return;
  const family = familyOf(css);
  const range = widenToWord(live);
  if (range.collapsed) return;

  const held = range.extractContents();
  // The wrappers *around* the selection first — see `peelEmptied`.
  if (family) peelEmptied(root, range, family);
  // Then this family wherever it already is inside it, dropping any span left
  // holding nothing: an empty `<span>` is a `[]{}` on the way back out, which
  // is not a thing a note can say.
  if (family) {
    for (const inner of Array.from(held.querySelectorAll<HTMLElement>('*'))) {
      for (const name of Array.from(inner.classList)) {
        if (familyOf(name) === family) inner.classList.remove(name);
      }
      if (inner.tagName === 'SPAN' && inner.classList.length === 0) {
        inner.replaceWith(...Array.from(inner.childNodes));
      }
    }
  }

  const span = document.createElement('span');
  span.className = css;
  span.append(held);
  range.insertNode(span);
  reselect(span);
}

/** Take a whole family back off the selection. The eraser under each palette. */
export function clearFamily(root: HTMLElement, family: Family): void {
  const range = rangeIn(root);
  if (!range || range.collapsed) return;
  const held = range.extractContents();
  peelEmptied(root, range, family);
  for (const inner of Array.from(held.querySelectorAll<HTMLElement>('*'))) {
    for (const name of Array.from(inner.classList)) {
      if (familyOf(name) === family) inner.classList.remove(name);
    }
    const bare = inner.tagName === 'SPAN' && inner.classList.length === 0;
    const wasMark = inner.tagName === 'MARK' && family === 'mark';
    if (bare || wasMark) inner.replaceWith(...Array.from(inner.childNodes));
  }
  const holder = document.createElement('span');
  holder.append(held);
  range.insertNode(holder);
  holder.replaceWith(...Array.from(holder.childNodes));
}

/** `<code>`, which execCommand has no name for. */
export function codeSelection(root: HTMLElement): void {
  const live = rangeIn(root);
  if (!live) return;
  const range = widenToWord(live);
  if (range.collapsed) return;
  const code = document.createElement('code');
  code.textContent = range.toString();
  range.deleteContents();
  range.insertNode(code);
  reselect(code);
}

/**
 * A checklist, which is a bulleted list whose items open with a box.
 *
 * `execCommand` has no name for one, so it makes the list and the boxes go in
 * afterwards. The box is the same `span.md-box` the renderer draws, which is
 * what lets `toMarkdown` write the item back out as `- [ ] ` and what lets a
 * reader tick one by clicking it.
 */
export function checklistSelection(root: HTMLElement): void {
  const before = rangeIn(root);
  if (!before) return;
  command(root, 'insertUnorderedList');

  const range = rangeIn(root);
  let at: Node | null = range?.commonAncestorContainer ?? null;
  while (at && at !== root) {
    if (at.nodeType === Node.ELEMENT_NODE && (at as HTMLElement).tagName === 'UL') break;
    at = at.parentNode;
  }
  if (!at || at === root) return;

  for (const item of Array.from((at as HTMLElement).querySelectorAll('li'))) {
    const first = item.firstElementChild;
    if (first && first.classList.contains('md-box')) continue;
    const box = document.createElement('span');
    box.className = 'md-box';
    box.setAttribute('aria-hidden', 'true');
    item.prepend(box);
  }
}

/**
 * Tick or untick the box that was clicked.
 *
 * Returns whether it did anything, so the editor knows whether the note
 * changed. A checklist you cannot tick from the note is a checklist that has
 * to be edited to be used, which is not what anybody draws a box for.
 */
export function toggleBox(target: HTMLElement): boolean {
  const box = target.closest?.('.md-box');
  if (!box) return false;
  box.classList.toggle('is-on');
  const body = box.nextElementSibling;
  if (body) body.classList.toggle('md-done', box.classList.contains('is-on'));
  return true;
}

/**
 * The shorthands, still working, in an editor that no longer shows them.
 *
 * `## ` at the front of a line made a heading in the old textarea, and that is
 * the muscle memory of everybody who has used this page — and, since the
 * toolbar's size selector replaced the four heading buttons, the only way to
 * reach a heading at all. So the punctuation is still accepted: it is read at
 * the moment the space is typed, applied as the block it names, and removed.
 * What is on screen a keystroke later is the heading rather than the hashes.
 *
 * Returns whether it claimed the keystroke.
 */
export function autoformat(root: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !root.contains(range.startContainer)) return false;

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const before = (node.nodeValue ?? '').slice(0, range.startOffset);
  // Only at the very front of a line: `- ` mid-sentence is a dash.
  if (before !== (node.nodeValue ?? '').slice(0, range.startOffset).trimStart()) return false;
  if (node.previousSibling) return false;

  const heading = /^(#{1,4})$/.exec(before);
  const quote = before === '>';
  const bullet = before === '-' || before === '*';
  const numbered = /^(\d+|[A-Za-z])[.)]$/.exec(before);
  const checkbox = before === '[]' || before === '[ ]';
  if (!heading && !quote && !bullet && !numbered && !checkbox) return false;

  // Take the shorthand out first, so the block rule below acts on a bare line.
  const rest = document.createRange();
  rest.setStart(node, 0);
  rest.setEnd(node, range.startOffset);
  rest.deleteContents();

  if (heading) blockSelection(root, `h${heading[1]!.length}`);
  else if (quote) blockSelection(root, 'blockquote');
  else if (bullet) listSelection(root, false);
  else if (checkbox) checklistSelection(root);
  else if (numbered) {
    const marker = numbered[1]!;
    const type = /^\d+$/.test(marker)
      ? '1'
      : /^[ivxlcdm]+$/.test(marker)
        ? 'i'
        : /^[IVXLCDM]+$/.test(marker)
          ? 'I'
          : marker === marker.toUpperCase() ? 'A' : 'a';
    listSelection(root, true, type);
  }
  return true;
}

export function ruleAt(root: HTMLElement): void {
  const range = rangeIn(root);
  if (!range) return;
  const rule = document.createElement('hr');
  range.deleteContents();
  range.insertNode(rule);
}

/**
 * Put a link in, as the pill the reader sees rather than as `[a](b)`.
 *
 * `label` wins over the selection when the picker supplied one — choosing
 * "Revise integrals" from the list means that is what the link should say,
 * whatever three words happened to be selected. With nothing selected and no
 * label, there is nothing to make a link out of and nothing happens.
 */
export function linkSelection(root: HTMLElement, href: string, label: string): void {
  const range = rangeIn(root);
  if (!range) return;
  const text = label || range.toString();
  if (!text) return;

  const kind = href.startsWith('http') || href.startsWith('mailto:')
    ? 'external'
    : /^\/tasks\?(?:[^#]*&)?task=/.test(href)
      ? 'task'
      : /^\/goals\?(?:[^#]*&)?goal=/.test(href)
        ? 'goal'
        : 'page';

  const anchor = document.createElement('a');
  anchor.className = `md-link is-${kind}`;
  anchor.setAttribute('href', href);
  if (kind === 'external') {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noreferrer noopener');
  } else {
    anchor.setAttribute('data-nav', href);
  }
  anchor.textContent = text;

  range.deleteContents();
  range.insertNode(anchor);

  // The caret goes after the pill rather than inside it: the next thing
  // anybody types after inserting a link is the rest of the sentence, and
  // typing it inside the anchor would quietly extend the link over it.
  const after = document.createRange();
  after.setStartAfter(anchor);
  after.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(after);
}

/**
 * What the caret is standing in, for the labels on the two selectors.
 *
 * Read off the ancestors rather than remembered, which is the property the
 * old string version had and the reason it is kept: a control whose label
 * never changes when you use it is indistinguishable from one that does
 * nothing. See the note in pages/Notes.
 */
export function marksAt(root: HTMLElement): Record<Family, string | null> {
  const found: Record<Family, string | null> = { ink: null, mark: null, face: null, size: null };
  const selection = window.getSelection();
  let at: Node | null = selection?.anchorNode ?? null;
  if (!at || !root.contains(at)) return found;

  while (at && at !== root) {
    if (at.nodeType === Node.ELEMENT_NODE) {
      const element = at as HTMLElement;
      // A `<mark>` is the yellow highlighter written the short way.
      if (element.tagName === 'MARK' && !found.mark) found.mark = 'bg-yellow';
      for (const css of Array.from(element.classList)) {
        const family = familyOf(css);
        if (family && !found[family]) found[family] = TOKEN_OF_CLASS[css] ?? null;
      }
    }
    at = at.parentNode;
  }
  return found;
}
