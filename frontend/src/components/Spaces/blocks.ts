/**
 * A space's page as blocks — the rules, with no React in them.
 *
 * The page is a flat list of blocks, each one kind (text, a heading, a list
 * item, a toggle …) with an indent. Nesting is the indent and nothing else:
 * a block "inside" a toggle or under a list item is simply the run of blocks
 * after it that sit deeper. That keeps every edit a list edit, and it is how
 * a collapsed toggle hides what is under it (`hiddenIds`) and how moving a
 * block takes what is under it along (`span`, `moveTo`).
 *
 * The kinds, the deepest indent and the covers come from shared/rules.json,
 * which backend/api/spaces.py checks every page it is sent against.
 */

import { escapeInline, plainOf } from './inline';
import { RULES } from '@/utils/sharedRules';

export type BlockType =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'code';

export interface Block {
  id: string;
  type: BlockType;
  /**
   * The words, as inline Markdown — `**bold**` and `*italic*` (./inline) —
   * except in a code block, where they are literal.
   */
  text: string;
  /** 0 when absent. */
  indent?: number;
  /** To-dos only. */
  checked?: boolean;
  /** Toggles only: shut, so the blocks under it are hidden. */
  collapsed?: boolean;
}

export interface SpaceDoc {
  /** An emoji, or '' for none. */
  icon: string;
  /** One of COVERS, or '' for none. */
  cover: string;
  blocks: Block[];
}

export const INDENT_MAX: number = RULES.spaces.indent_max;

export interface BlockKind {
  type: BlockType;
  label: string;
  hint: string;
  /** What the slash menu's filter matches besides the label. */
  keys: string[];
  /** The small mark beside it in the menus. */
  glyph: string;
}

/** Every kind, in the order the slash menu lists them. */
export const BLOCK_KINDS: BlockKind[] = [
  { type: 'text', label: 'Text', hint: 'Just start writing with plain text.', keys: ['plain', 'paragraph'], glyph: 'Aa' },
  { type: 'h1', label: 'Heading 1', hint: 'Big section heading.', keys: ['h1', 'title', '#'], glyph: 'H1' },
  { type: 'h2', label: 'Heading 2', hint: 'Medium section heading.', keys: ['h2', 'subtitle', '##'], glyph: 'H2' },
  { type: 'h3', label: 'Heading 3', hint: 'Small section heading.', keys: ['h3', '###'], glyph: 'H3' },
  { type: 'todo', label: 'To-do list', hint: 'Track tasks with a checkbox.', keys: ['todo', 'task', 'check', 'checkbox', '[]'], glyph: '☑' },
  { type: 'bullet', label: 'Bulleted list', hint: 'Create a simple bulleted list.', keys: ['bullet', 'ul', 'unordered', '-'], glyph: '≡' },
  { type: 'numbered', label: 'Numbered list', hint: 'Create a list with numbering.', keys: ['number', 'ol', 'ordered', '1.'], glyph: '1.' },
  { type: 'toggle', label: 'Toggle list', hint: 'Hide and show what is inside.', keys: ['toggle', 'collapse', 'fold', 'details', '>'], glyph: '▶' },
  { type: 'quote', label: 'Quote', hint: 'Capture a quote.', keys: ['blockquote', 'citation', '"'], glyph: '❝' },
  { type: 'callout', label: 'Callout', hint: 'Make writing stand out.', keys: ['note', 'tip', 'info', 'highlight'], glyph: '💡' },
  { type: 'divider', label: 'Divider', hint: 'Visually divide blocks.', keys: ['line', 'hr', 'separator', 'rule', '---'], glyph: '—' },
  { type: 'code', label: 'Code', hint: 'Capture a code snippet.', keys: ['snippet', 'pre', '```'], glyph: '</>' },
];

/** The kinds the slash menu offers for what was typed after the slash. */
export function matchKinds(query: string): BlockKind[] {
  const q = query.trim().toLowerCase();
  if (!q) return BLOCK_KINDS;
  return BLOCK_KINDS.filter(
    (kind) =>
      kind.label.toLowerCase().includes(q) ||
      kind.type.startsWith(q) ||
      kind.keys.some((key) => key.startsWith(q)),
  );
}

/** List-like kinds: Enter carries them on, and Enter on an empty one ends the list. */
export const LISTS: ReadonlySet<BlockType> = new Set(['bullet', 'numbered', 'todo', 'toggle']);

/** A cover is one of these gradients, named for the stylesheet's classes. */
export const COVERS: readonly string[] = RULES.spaces.covers;

/** The icons on offer. Any emoji is stored; these are the ones the picker shows. */
export const ICONS = [
  '📝', '📚', '🎯', '💡', '🧠', '🗂️', '📌', '✅', '🚀', '🌱', '🔥', '⭐',
  '🎨', '🎵', '🧪', '🧮', '💻', '🏃', '🍎', '☕', '🌍', '📅', '🏔️', '🔬',
  '✏️', '📖', '🗒️', '💼', '🏆', '❤️', '🌙', '☀️',
];

let made = 0;
/** A fresh id: unique within the session, which is all a row key needs. */
export function newId(): string {
  made += 1;
  return `b${Date.now().toString(36)}${made.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function block(type: BlockType = 'text', text = '', extra: Partial<Block> = {}): Block {
  return { id: newId(), type, text, ...extra };
}

export const indentOf = (one: Block): number => one.indent ?? 0;

/**
 * The same block as another kind, dropping what only the old kind meant.
 * Into code, the words lose their formatting; out of it, their stars are
 * escaped, so a `**` in a snippet stays two stars rather than turning bold.
 */
export function retype(one: Block, type: BlockType): Block {
  let text = one.text;
  if (type === 'divider') text = '';
  else if (type === 'code' && one.type !== 'code') text = plainOf(one.text);
  else if (type !== 'code' && one.type === 'code') text = escapeInline(one.text);
  const next: Block = { id: one.id, type, text };
  if (one.indent) next.indent = one.indent;
  if (type === 'todo' && one.type === 'todo' && one.checked) next.checked = true;
  return next;
}

// --------------------------------------------------------------------------
// Typing shortcuts
// --------------------------------------------------------------------------
const SHORTCUTS: Array<[RegExp, BlockType, Partial<Block>?]> = [
  [/^#\s/, 'h1'],
  [/^##\s/, 'h2'],
  [/^###\s/, 'h3'],
  [/^[-*+]\s/, 'bullet'],
  [/^\d+[.)]\s/, 'numbered'],
  [/^\[\s?\]\s/, 'todo'],
  [/^\[[xX]\]\s/, 'todo', { checked: true }],
  [/^>\s/, 'toggle'],
  [/^["“]\s/, 'quote'],
];

/**
 * What a plain text block becomes when it starts with Notion's own
 * shortcuts: "# " a heading, "- " a bullet, "1. " a numbered item, "[] " a
 * to-do, "> " a toggle, '" ' a quote, "---" a divider and "```" code.
 * Null when the text starts with none of them.
 */
export function shortcut(text: string): { type: BlockType; text: string; extra: Partial<Block> } | null {
  if (text === '---') return { type: 'divider', text: '', extra: {} };
  if (text.startsWith('```')) return { type: 'code', text: text.slice(3), extra: {} };
  for (const [pattern, type, extra] of SHORTCUTS) {
    const hit = pattern.exec(text);
    if (hit) return { type, text: text.slice(hit[0].length), extra: extra ?? {} };
  }
  return null;
}

// --------------------------------------------------------------------------
// From plain text
// --------------------------------------------------------------------------
const LINES: Array<[RegExp, BlockType, Partial<Block>?]> = [
  [/^###\s/, 'h3'],
  [/^##\s/, 'h2'],
  [/^#\s/, 'h1'],
  [/^[-*+]\s\[\s?\]\s/, 'todo'],
  [/^[-*+]\s\[[xX]\]\s/, 'todo', { checked: true }],
  [/^[-*+]\s/, 'bullet'],
  [/^\d+[.)]\s/, 'numbered'],
  [/^>\s?/, 'quote'],
  [/^▸\s/, 'toggle'],
  [/^💡\s/, 'callout'],
];

/**
 * A page written as plain text — every space before blocks, and the `body`
 * the server writes from blocks — read back into blocks. One line, one block;
 * two leading spaces are one indent; a ``` fence is one code block.
 */
export function fromBody(body: string): Block[] {
  const out: Block[] = [];
  const lines = (body ?? '').split('\n');
  for (let at = 0; at < lines.length; at += 1) {
    const raw = lines[at]!;
    const lead = raw.length - raw.trimStart().length;
    const indent = Math.min(INDENT_MAX, Math.floor(lead / 2));
    const line = raw.trimStart();
    const extra: Partial<Block> = indent ? { indent } : {};

    if (line.startsWith('```')) {
      const code: string[] = [];
      at += 1;
      while (at < lines.length && !lines[at]!.trimStart().startsWith('```')) {
        code.push(lines[at]!);
        at += 1;
      }
      out.push(block('code', code.join('\n'), extra));
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      out.push(block('divider', '', extra));
      continue;
    }
    const hit = LINES.find(([pattern]) => pattern.test(line));
    if (hit) {
      const [pattern, type, more] = hit;
      out.push(block(type, line.replace(pattern, ''), { ...extra, ...more }));
    } else {
      out.push(block('text', line, extra));
    }
  }
  return out.length ? out : [block()];
}

/**
 * A page as stored, made safe to edit: known kinds, unique ids, bounded
 * indents, and at least one block to type in.
 */
export function normalise(doc: Partial<SpaceDoc> | null | undefined, body = ''): SpaceDoc {
  const kinds = new Set(BLOCK_KINDS.map((kind) => kind.type));
  const seen = new Set<string>();
  const blocks = Array.isArray(doc?.blocks)
    ? doc!.blocks
        .filter((one) => one && typeof one === 'object')
        .map((one) => {
          let id = typeof one.id === 'string' && one.id ? one.id : newId();
          if (seen.has(id)) id = newId();
          seen.add(id);
          const type = kinds.has(one.type) ? one.type : 'text';
          const next: Block = { id, type, text: typeof one.text === 'string' ? one.text : '' };
          const indent = Math.max(0, Math.min(INDENT_MAX, Math.floor(Number(one.indent) || 0)));
          if (indent) next.indent = indent;
          if (type === 'todo' && one.checked) next.checked = true;
          if (type === 'toggle' && one.collapsed) next.collapsed = true;
          return next;
        })
    : fromBody(body);
  return {
    icon: typeof doc?.icon === 'string' ? doc.icon : '',
    cover: (COVERS as readonly string[]).includes(doc?.cover ?? '') ? doc!.cover! : '',
    blocks: blocks.length ? blocks : [block()],
  };
}

// --------------------------------------------------------------------------
// Reading the list
// --------------------------------------------------------------------------
/** The ids a shut toggle hides: every block after it that sits deeper. */
export function hiddenIds(blocks: Block[]): Set<string> {
  const hidden = new Set<string>();
  let under: number | null = null;
  for (const one of blocks) {
    const indent = indentOf(one);
    if (under !== null && indent > under) {
      hidden.add(one.id);
      continue;
    }
    under = one.type === 'toggle' && one.collapsed ? indent : null;
  }
  return hidden;
}

/** A numbered item's number: one more than the items above it at its level. */
export function numberOf(blocks: Block[], at: number): number {
  const indent = indentOf(blocks[at]!);
  let n = 1;
  for (let back = at - 1; back >= 0; back -= 1) {
    const one = blocks[back]!;
    if (indentOf(one) > indent) continue;
    if (indentOf(one) === indent && one.type === 'numbered') n += 1;
    else break;
  }
  return n;
}

/** The index of the last block under the one at `at` (itself when none is). */
export function span(blocks: Block[], at: number): number {
  const indent = indentOf(blocks[at]!);
  let end = at;
  while (end + 1 < blocks.length && indentOf(blocks[end + 1]!) > indent) end += 1;
  return end;
}

/** Whether anything sits under the block at `at`. */
export const hasChildren = (blocks: Block[], at: number): boolean => span(blocks, at) > at;

/** A block's words as they read, without formatting marks. */
export const visibleText = (one: Block): string => (one.type === 'code' ? one.text : plainOf(one.text));

export function wordCount(blocks: Block[]): number {
  return blocks.reduce((sum, one) => sum + (visibleText(one).match(/\S+/g)?.length ?? 0), 0);
}

// --------------------------------------------------------------------------
// Changing the list
// --------------------------------------------------------------------------
/**
 * Move a block, and everything under it, before or after another.
 *
 * Dropped after a block that has children, it lands after those children too.
 * It takes the indent of the block it was dropped beside, and what was under
 * it keeps its depth relative to it. Dropping a block onto itself or into its
 * own children changes nothing.
 */
export function moveTo(blocks: Block[], id: string, target: string, place: 'before' | 'after'): Block[] {
  const from = blocks.findIndex((one) => one.id === id);
  if (from < 0 || id === target) return blocks;
  const end = span(blocks, from);
  const moving = blocks.slice(from, end + 1);
  if (moving.some((one) => one.id === target)) return blocks;

  const rest = [...blocks.slice(0, from), ...blocks.slice(end + 1)];
  let at = rest.findIndex((one) => one.id === target);
  if (at < 0) return blocks;
  const depth = indentOf(rest[at]!);
  if (place === 'after') at = span(rest, at) + 1;

  const shift = depth - indentOf(moving[0]!);
  const placed = moving.map((one) => {
    const indent = Math.max(0, Math.min(INDENT_MAX, indentOf(one) + shift));
    const next = { ...one };
    if (indent) next.indent = indent;
    else delete next.indent;
    return next;
  });
  return [...rest.slice(0, at), ...placed, ...rest.slice(at)];
}

/** One place up: before the block above it. */
export function moveUp(blocks: Block[], id: string): Block[] {
  const at = blocks.findIndex((one) => one.id === id);
  if (at <= 0) return blocks;
  return moveTo(blocks, id, blocks[at - 1]!.id, 'before');
}

/** One place down: after the block below it and whatever is under that. */
export function moveDown(blocks: Block[], id: string): Block[] {
  const at = blocks.findIndex((one) => one.id === id);
  if (at < 0) return blocks;
  const next = blocks[span(blocks, at) + 1];
  return next ? moveTo(blocks, id, next.id, 'after') : blocks;
}

/** A copy of the block and what is under it, straight after the original. */
export function duplicate(blocks: Block[], id: string): { blocks: Block[]; copy: string | null } {
  const at = blocks.findIndex((one) => one.id === id);
  if (at < 0) return { blocks, copy: null };
  const end = span(blocks, at);
  const copies = blocks.slice(at, end + 1).map((one) => ({ ...one, id: newId() }));
  return {
    blocks: [...blocks.slice(0, end + 1), ...copies, ...blocks.slice(end + 1)],
    copy: copies[0]!.id,
  };
}

/**
 * Take a block out. A toggle goes with what is inside it, the way a folder
 * would; anything else leaves its children where they are. Never leaves the
 * page with nothing to type in.
 */
export function remove(blocks: Block[], id: string): Block[] {
  const at = blocks.findIndex((one) => one.id === id);
  if (at < 0) return blocks;
  const end = blocks[at]!.type === 'toggle' ? span(blocks, at) : at;
  const next = [...blocks.slice(0, at), ...blocks.slice(end + 1)];
  return next.length ? next : [block()];
}
