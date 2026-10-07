/**
 * An editable block's DOM, read and steered in visible-text offsets.
 *
 * The block editor thinks in offsets into a block's words (components/Spaces/
 * inline). The browser thinks in (node, offset) pairs inside whatever markup
 * the field holds — ours (<strong>, <em>, text, a trailing <br>) and, after
 * the browser's own bold command or a stray edit, its own (<b>, <i>, a span
 * with a font weight, a <div> for a new line). These three functions are the
 * translation, and they read the browser's markup as well as ours.
 */
import { normaliseRuns, type Run } from './inline';

interface Piece extends Run {
  /** A <br>: a line break, unless it is the one the browser keeps last. */
  br?: boolean;
}

function collect(root: Node): Piece[] {
  const out: Piece[] = [];
  const visit = (node: Node, bold: boolean, italic: boolean) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child as Text).data;
        if (text) out.push({ text, bold, italic });
        return;
      }
      if (!(child instanceof HTMLElement)) return;
      const tag = child.tagName;
      if (tag === 'BR') {
        out.push({ text: '\n', bold, italic, br: true });
        return;
      }
      let b = bold || tag === 'B' || tag === 'STRONG';
      let i = italic || tag === 'I' || tag === 'EM';
      const weight = child.style.fontWeight;
      if (weight === 'bold' || Number(weight) >= 600) b = true;
      if (weight === 'normal' || (weight && Number(weight) < 600)) b = false;
      if (child.style.fontStyle === 'italic') i = true;
      if (child.style.fontStyle === 'normal') i = false;
      // A block element the browser made is a new line, unless one is there.
      if ((tag === 'DIV' || tag === 'P') && out.length && !out[out.length - 1]!.text.endsWith('\n')) {
        out.push({ text: '\n', bold, italic });
      }
      visit(child, b, i);
    });
  };
  visit(root, false, false);
  return out;
}

/** What the field holds, as runs. A last <br> is the browser's placeholder, not a line. */
export function readDom(root: Node): Run[] {
  const pieces = collect(root);
  if (pieces[pieces.length - 1]?.br) pieces.pop();
  return normaliseRuns(pieces);
}

const lengthOf = (pieces: Piece[]) => pieces.reduce((sum, piece) => sum + piece.text.length, 0);

/** The visible offset of a DOM point inside `root`. */
export function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  if (!root.contains(node)) return lengthOf(collect(root));
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  const holder = document.createElement('div');
  holder.appendChild(range.cloneContents());
  return lengthOf(collect(holder));
}

/** The selection inside `root` in visible offsets, or null when it is elsewhere. */
export function selectionIn(root: HTMLElement): { start: number; end: number } | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return {
    start: offsetOf(root, range.startContainer, range.startOffset),
    end: offsetOf(root, range.endContainer, range.endOffset),
  };
}

/** The DOM point at a visible offset. Past the end is the end. */
function pointAt(root: HTMLElement, target: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let at = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node as Text).data.length;
      if (target <= at + length) return [node, target - at];
      at += length;
    } else if (node.nodeName === 'BR') {
      const parent = node.parentNode!;
      if (target <= at) return [parent, Array.prototype.indexOf.call(parent.childNodes, node)];
      at += 1;
    }
  }
  return [root, root.childNodes.length];
}

/** Select from `start` to `end` (a caret when they match) inside `root`. */
export function setSelection(root: HTMLElement, start: number, end = start): void {
  const selection = document.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const [startNode, startOffset] = pointAt(root, start);
  const [endNode, endOffset] = end === start ? [startNode, startOffset] : pointAt(root, end);
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Whether the caret sits on the field's first (or last) visual line, so Up
 * (or Down) should leave the block. Measured where the browser can measure;
 * where it cannot, a line break before (or after) the caret decides.
 */
export function onEdgeLine(root: HTMLElement, edge: 'first' | 'last', text: string, caret: number): boolean {
  const selection = document.getSelection();
  const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  const rect = range?.getClientRects?.()[0];
  if (rect && rect.height > 0) {
    const box = root.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(root).lineHeight) || rect.height;
    return edge === 'first' ? rect.top - box.top < line * 0.75 : box.bottom - rect.bottom < line * 0.75;
  }
  return edge === 'first' ? !text.slice(0, caret).includes('\n') : !text.slice(caret).includes('\n');
}
