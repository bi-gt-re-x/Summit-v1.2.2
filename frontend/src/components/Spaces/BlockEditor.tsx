/**
 * A space's page, edited block by block the way Notion edits one.
 *
 * Each block is its own field. What the editor offers:
 *
 *   - "/" opens a menu of block kinds, filtered by what is typed after it;
 *     arrows pick, Enter takes, Escape shuts.
 *   - Notion's typing shortcuts at the start of a text block: "# " "## "
 *     "### " headings, "- " bullets, "1. " numbers, "[] " to-dos, "> " a
 *     toggle, '" ' a quote, "---" a divider, "```" code.
 *   - Enter starts a new block (a list carries on; Enter on an empty item ends
 *     the list), Shift+Enter a new line inside one, Backspace at the start
 *     turns a block back into text and then joins it to the one above.
 *   - Tab and Shift+Tab indent; a toggle hides what sits deeper under it.
 *   - Up and Down cross from block to block; ⌘/Ctrl+D duplicates.
 *   - Each block has a handle: drag it to move the block (and what is under
 *     it), or click it for Turn into, Duplicate, Move and Delete. The + beside
 *     it adds a block below and opens the slash menu there.
 *   - Bold and italic inside a block: ⌘/Ctrl+B and ⌘/Ctrl+I, the B and I in
 *     the bar that rises over a selection, or typing "**word**" / "*word*".
 *
 * Every block but code is an editable rich-text field (`RichField`) whose
 * words are stored as inline Markdown; code stays a plain textarea. Offsets
 * here are always into the *visible* words — ./inline turns them into edits
 * of the Markdown, and ./richDom into places in the field. The block rules
 * are in ./blocks. None of the three has React in it, and each is tested on
 * its own.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  BLOCK_KINDS,
  INDENT_MAX,
  LISTS,
  block,
  duplicate,
  hasChildren,
  hiddenIds,
  indentOf,
  matchKinds,
  moveDown,
  moveTo,
  moveUp,
  numberOf,
  remove,
  retype,
  shortcut,
  span,
  visibleText,
  fromBody,
  type Block,
  type BlockType,
} from './blocks';
import {
  autoFormat,
  hasMark,
  joinInline,
  plainOf,
  setMark,
  sliceInline,
  spliceInline,
  toHtml,
  serialize,
  type Mark,
} from './inline';
import { onEdgeLine, readDom, selectionIn, setSelection } from './richDom';

/** What each empty kind says in grey. Text says it only when focused. */
const PLACEHOLDER: Record<BlockType, string> = {
  text: "Type '/' for commands",
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  bullet: 'List',
  numbered: 'List',
  todo: 'To-do',
  toggle: 'Toggle',
  quote: 'Empty quote',
  callout: 'Callout',
  divider: '',
  code: 'Code',
};

const BULLETS = ['•', '◦', '▪'];

type Caret = 'start' | 'end' | number;

/** Code keeps its words literal; every other kind with words is rich text. */
const isRich = (one: Block) => one.type !== 'code' && one.type !== 'divider';

/** Where the selection is in a block's field, in visible offsets. */
function selectionOf(node: HTMLElement, text: string): { start: number; end: number } {
  if (node instanceof HTMLTextAreaElement) return { start: node.selectionStart, end: node.selectionEnd };
  return selectionIn(node) ?? { start: text.length, end: text.length };
}

interface Slash {
  id: string;
  /** Where the "/" is in the block's text. */
  from: number;
  query: string;
  index: number;
}

/** Shut on a click anywhere else, or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, close]);
  return ref;
}

export interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  disabled?: boolean;
  /** Names the page for a screen reader. */
  label: string;
}

export function BlockEditor({ blocks, onChange, disabled = false, label }: BlockEditorProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const nodes = useRef(new Map<string, HTMLTextAreaElement | HTMLDivElement>());
  /* Where the caret (or, with `end`, the selection) goes after an edit. */
  /* `release` turns a mark off for what is typed next, as after "**word**". */
  const [focus, setFocus] = useState<{ id: string; at: Caret; end?: number; release?: Mark } | null>(null);
  /* The bold / italic bar over a selection, placed inside the editor. */
  const [bar, setBar] = useState<{ id: string; top: number; left: number } | null>(null);
  const [slash, setSlash] = useState<Slash | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null; place: 'before' | 'after' } | null>(null);

  const hidden = useMemo(() => hiddenIds(blocks), [blocks]);
  const visible = useMemo(() => blocks.filter((one) => !hidden.has(one.id)), [blocks, hidden]);

  /* The caret goes where an edit says, once the edit is on screen. */
  useLayoutEffect(() => {
    if (!focus) return;
    const node = nodes.current.get(focus.id);
    if (!node) return;
    node.focus();
    if (node instanceof HTMLTextAreaElement) {
      const at = focus.at === 'start' ? 0 : focus.at === 'end' ? node.value.length : focus.at;
      node.setSelectionRange(at, focus.end ?? at);
    } else if (node.classList.contains('sp-rich')) {
      const length = plainOf(blocks.find((one) => one.id === focus.id)?.text ?? '').length;
      const at = focus.at === 'start' ? 0 : focus.at === 'end' ? length : focus.at;
      setSelection(node, at, focus.end ?? at);
      // A caret at the end of a bold word types bold; once "**word**" has
      // closed it should not. The browser's own command flips the style for
      // the next keystrokes without touching the text.
      if (focus.release && document.queryCommandState?.(focus.release)) {
        document.execCommand?.(focus.release);
      }
    }
    setFocus(null);
  }, [focus, blocks]);

  /* The bar follows the selection: up over it while some words in one block
     are selected, gone otherwise. */
  useEffect(() => {
    const follow = () => {
      const selection = document.getSelection();
      const anchor = selection?.anchorNode;
      const host = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest<HTMLElement>('.sp-rich');
      if (!selection || selection.isCollapsed || !selection.rangeCount || !host || !root.current?.contains(host)) {
        setBar(null);
        return;
      }
      // Where the browser cannot measure a range, the block stands in for it.
      const range = selection.getRangeAt(0);
      const rect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : host.getBoundingClientRect();
      const box = root.current.getBoundingClientRect();
      setBar({
        id: host.dataset.block ?? '',
        top: rect.top - box.top - 44,
        left: Math.max(0, rect.left - box.left + rect.width / 2 - 40),
      });
    };
    document.addEventListener('selectionchange', follow);
    return () => document.removeEventListener('selectionchange', follow);
  }, []);

  const at = useCallback((id: string) => blocks.findIndex((one) => one.id === id), [blocks]);
  const patch = (id: string, change: Partial<Block>) =>
    onChange(blocks.map((one) => (one.id === id ? { ...one, ...change } : one)));
  const swap = (id: string, next: Block) => onChange(blocks.map((one) => (one.id === id ? next : one)));
  const neighbour = (id: string, step: -1 | 1) => visible[visible.findIndex((one) => one.id === id) + step];

  /** Put new blocks straight after `id` — after its children when it is a shut toggle. */
  const insertAfter = (list: Block[], id: string, fresh: Block[]) => {
    const index = list.findIndex((one) => one.id === id);
    const host = list[index]!;
    const end = host.type === 'toggle' && host.collapsed ? span(list, index) : index;
    return [...list.slice(0, end + 1), ...fresh, ...list.slice(end + 1)];
  };

  /** Add a block of `type` below `id` and put the caret in it. */
  const addBelow = (id: string, type: BlockType = 'text', openMenu = false) => {
    const host = blocks[at(id)]!;
    const indent = host.type === 'toggle' && !host.collapsed ? Math.min(INDENT_MAX, indentOf(host) + 1) : indentOf(host);
    // With the menu, the "/" is typed for the reader, so the filter works as
    // if they had typed it.
    const menuToo = openMenu && type === 'text';
    const fresh = block(type, menuToo ? '/' : '', indent ? { indent } : {});
    const extra = type === 'divider' ? [block('text', '', indent ? { indent } : {})] : [];
    onChange(insertAfter(blocks, id, [fresh, ...extra]));
    if (menuToo) {
      setFocus({ id: fresh.id, at: 1 });
      setSlash({ id: fresh.id, from: 0, query: '', index: 0 });
    } else {
      setFocus({ id: (extra[0] ?? fresh).id, at: 'start' });
    }
  };

  /** Take a kind from the slash menu. */
  const choose = (type: BlockType) => {
    if (!slash) return;
    const host = blocks[at(slash.id)];
    setSlash(null);
    if (!host) return;
    const text = spliceInline(host.text, slash.from, slash.from + 1 + slash.query.length);
    if (plainOf(text).trim() === '') {
      if (type === 'divider') {
        const after = block('text', '', host.indent ? { indent: host.indent } : {});
        onChange(blocks.flatMap((one) => (one.id === host.id ? [retype(host, 'divider'), after] : [one])));
        setFocus({ id: after.id, at: 'start' });
        return;
      }
      swap(host.id, { ...retype(host, type), text: '' });
      setFocus({ id: host.id, at: 'start' });
      return;
    }
    // There is writing in this block already: the new kind goes below it.
    const fresh = block(type, '', host.indent ? { indent: host.indent } : {});
    const extra = type === 'divider' ? [block('text', '', host.indent ? { indent: host.indent } : {})] : [];
    onChange(insertAfter(blocks.map((one) => (one.id === host.id ? { ...one, text } : one)), host.id, [fresh, ...extra]));
    setFocus({ id: (extra[0] ?? fresh).id, at: 'start' });
  };

  /**
   * A block's words changed in its field. `value` is the block's text as
   * stored (Markdown, or literal in code) and `caret` a visible offset.
   */
  const edit = (one: Block, value: string, caret: number) => {
    if (!isRich(one)) {
      patch(one.id, { text: value });
      return;
    }
    const was = plainOf(one.text);
    const now = plainOf(value);

    // The slash menu follows what is typed after the "/".
    if (slash && slash.id === one.id) {
      const query = now.slice(slash.from + 1, caret);
      if (now[slash.from] !== '/' || caret <= slash.from || /\s/.test(query) || query.length > 24) {
        setSlash(null);
      } else if (query !== slash.query) {
        setSlash({ ...slash, query, index: 0 });
      }
    } else if (
      now.length === was.length + 1 &&
      now[caret - 1] === '/' &&
      (caret === 1 || /\s/.test(now[caret - 2] ?? ''))
    ) {
      setSlash({ id: one.id, from: caret - 1, query: '', index: 0 });
    }

    if (now.length > was.length) {
      const hit = one.type === 'text' ? shortcut(now) : null;
      const cut = hit ? now.length - hit.text.length : -1;
      if (hit && caret === cut) {
        setSlash(null);
        if (hit.type === 'divider') {
          const after = block('text', '', one.indent ? { indent: one.indent } : {});
          onChange(blocks.flatMap((row) => (row.id === one.id ? [retype(one, 'divider'), after] : [row])));
          setFocus({ id: after.id, at: 'start' });
          return;
        }
        const text = hit.type === 'code' ? hit.text : sliceInline(value, cut);
        swap(one.id, { ...retype(one, hit.type), text, ...hit.extra });
        setFocus({ id: one.id, at: 0 });
        return;
      }
      // "**word**" and "*word*" turn into bold and italic as they close.
      const formatted = autoFormat(value, caret);
      if (formatted) {
        patch(one.id, { text: formatted.text });
        setFocus({ id: one.id, at: formatted.caret, release: formatted.mark });
        return;
      }
    }
    patch(one.id, { text: value });
  };

  /**
   * Bold or italic over the selection. With nothing selected, the browser's
   * own command sets the style for what is typed next.
   */
  const mark = (id: string, which: Mark) => {
    const node = nodes.current.get(id);
    const one = blocks.find((row) => row.id === id);
    if (!node || !one || !isRich(one)) return;
    const { start, end } = selectionOf(node, plainOf(one.text));
    if (start === end) {
      document.execCommand?.(which);
      return;
    }
    const on = !hasMark(one.text, start, end, which);
    patch(id, { text: setMark(one.text, start, end, which, on) });
    setFocus({ id, at: start, end });
  };

  /**
   * Pasted words go in as plain text. Several lines become several blocks,
   * read the way a page written as plain text is (so "- item" lines arrive
   * as a list), with the rest of the block after the last of them.
   */
  const paste = (event: ClipboardEvent<HTMLElement>, one: Block) => {
    if (!isRich(one)) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (!text) return;
    const { start, end } = selectionOf(event.currentTarget, plainOf(one.text));
    const lines = text.split('\n');
    if (lines.length === 1) {
      patch(one.id, { text: spliceInline(one.text, start, end, text) });
      setFocus({ id: one.id, at: start + text.length });
      return;
    }
    const head = spliceInline(sliceInline(one.text, 0, start), start, start, lines[0]!);
    const more = fromBody(lines.slice(1).join('\n')).map((row) =>
      one.indent ? { ...row, indent: Math.min(INDENT_MAX, indentOf(row) + one.indent) } : row,
    );
    const last = more[more.length - 1]!;
    const caret = visibleText(last).length;
    const tail = sliceInline(one.text, end);
    more[more.length - 1] = last.type === 'code'
      ? { ...last, text: last.text + plainOf(tail) }
      : { ...last, text: joinInline(last.text, tail) };
    onChange(insertAfter(blocks.map((row) => (row.id === one.id ? { ...row, text: head } : row)), one.id, more));
    setFocus({ id: last.id, at: caret });
  };

  const key = (event: KeyboardEvent<HTMLElement>, one: Block) => {
    const field = event.currentTarget;
    const words = visibleText(one);
    const { start, end } = selectionOf(field, words);

    if (slash && slash.id === one.id) {
      const options = matchKinds(slash.query);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const count = Math.max(1, options.length);
        setSlash({ ...slash, index: (slash.index + step + count) % count });
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && options.length) {
        event.preventDefault();
        choose(options[Math.min(slash.index, options.length - 1)]!.type);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSlash(null);
        return;
      }
    }
    if (event.nativeEvent.isComposing) return;
    const indent = indentOf(one);

    if ((event.metaKey || event.ctrlKey) && !event.altKey && isRich(one) && ['b', 'i'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      mark(one.id, event.key.toLowerCase() === 'b' ? 'bold' : 'italic');
      return;
    }

    // A line break inside a rich block is written by hand: the browser's own
    // would arrive as markup the field does not keep.
    if (event.key === 'Enter' && event.shiftKey && isRich(one)) {
      event.preventDefault();
      patch(one.id, { text: spliceInline(one.text, start, end, '\n') });
      setFocus({ id: one.id, at: start + 1 });
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      const made = duplicate(blocks, one.id);
      onChange(made.blocks);
      if (made.copy) setFocus({ id: made.copy, at: 'end' });
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      // Inside code, Enter is a new line; ⌘/Ctrl+Enter leaves the block.
      if (one.type === 'code' && !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (one.type === 'code') {
        addBelow(one.id);
        return;
      }
      // An empty list item ends the list: out a level first, then to text.
      if (LISTS.has(one.type) && words === '') {
        if (indent > 0) patch(one.id, { indent: indent - 1 });
        else swap(one.id, retype(one, 'text'));
        setFocus({ id: one.id, at: 'start' });
        return;
      }
      const carries: BlockType = ['bullet', 'numbered', 'todo'].includes(one.type) ? one.type : 'text';
      const depth = one.type === 'toggle' && !one.collapsed ? Math.min(INDENT_MAX, indent + 1) : indent;
      // At the very start of a block with words in it: a new one above.
      if (start === 0 && end === 0 && words !== '') {
        const fresh = block(carries, '', indent ? { indent } : {});
        const index = at(one.id);
        onChange([...blocks.slice(0, index), fresh, ...blocks.slice(index)]);
        setFocus({ id: one.id, at: 0 });
        return;
      }
      const fresh = block(carries, sliceInline(one.text, end), depth ? { indent: depth } : {});
      const kept = blocks.map((row) => (row.id === one.id ? { ...row, text: sliceInline(one.text, 0, start) } : row));
      onChange(insertAfter(kept, one.id, [fresh]));
      setFocus({ id: fresh.id, at: 0 });
      return;
    }

    if (event.key === 'Backspace' && start === 0 && end === 0) {
      if (one.type !== 'text') {
        event.preventDefault();
        swap(one.id, retype(one, 'text'));
        setFocus({ id: one.id, at: 0 });
        return;
      }
      if (indent > 0) {
        event.preventDefault();
        patch(one.id, { indent: indent - 1 });
        setFocus({ id: one.id, at: 0 });
        return;
      }
      const above = neighbour(one.id, -1);
      if (!above) return;
      event.preventDefault();
      if (above.type === 'divider') {
        onChange(blocks.filter((row) => row.id !== above.id));
        setFocus({ id: one.id, at: 0 });
        return;
      }
      const join = visibleText(above).length;
      const joined = above.type === 'code' ? above.text + words : joinInline(above.text, one.text);
      onChange(
        blocks
          .filter((row) => row.id !== one.id)
          .map((row) => (row.id === above.id ? { ...row, text: joined } : row)),
      );
      setFocus({ id: above.id, at: join });
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const index = at(one.id);
      const ceiling = index > 0 ? indentOf(blocks[index - 1]!) + 1 : 0;
      const next = event.shiftKey ? Math.max(0, indent - 1) : Math.min(INDENT_MAX, ceiling, indent + 1);
      if (next !== indent) {
        patch(one.id, { indent: next });
        setFocus({ id: one.id, at: start });
      }
      return;
    }

    const edge = (which: 'first' | 'last') =>
      field instanceof HTMLTextAreaElement
        ? !(which === 'first' ? words.slice(0, start) : words.slice(end)).includes('\n')
        : onEdgeLine(field, which, words, start);
    if (event.key === 'ArrowUp' && start === end && edge('first')) {
      const above = neighbour(one.id, -1);
      if (above) {
        event.preventDefault();
        setFocus({ id: above.id, at: 'end' });
      }
      return;
    }
    if (event.key === 'ArrowDown' && start === end && edge('last')) {
      const below = neighbour(one.id, 1);
      if (below) {
        event.preventDefault();
        setFocus({ id: below.id, at: 'start' });
      }
    }
  };

  /** Keys on a divider, which has no text to put a caret in. */
  const dividerKey = (event: KeyboardEvent<HTMLDivElement>, one: Block) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      const above = neighbour(one.id, -1) ?? neighbour(one.id, 1);
      onChange(remove(blocks, one.id));
      if (above) setFocus({ id: above.id, at: 'end' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      addBelow(one.id);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const next = neighbour(one.id, event.key === 'ArrowUp' ? -1 : 1);
      if (next) {
        event.preventDefault();
        setFocus({ id: next.id, at: event.key === 'ArrowUp' ? 'end' : 'start' });
      }
    }
  };

  /** Clicking under the last block writes at the end of the page. */
  const tail = () => {
    if (disabled) return;
    const last = blocks[blocks.length - 1]!;
    if (last.type === 'text' && visibleText(last) === '' && !hidden.has(last.id)) {
      setFocus({ id: last.id, at: 'start' });
      return;
    }
    const fresh = block();
    onChange([...blocks, fresh]);
    setFocus({ id: fresh.id, at: 'start' });
  };

  const lone = blocks.length === 1 && blocks[0]!.type === 'text' && blocks[0]!.text === '';

  return (
    <div
      ref={root}
      className={`sp-editor${lone ? ' is-empty' : ''}${drag ? ' is-dragging' : ''}`}
      role="group"
      aria-label={label}
    >
      {visible.map((one) => {
        const index = at(one.id);
        const indent = indentOf(one);
        const dropping = drag && drag.over === one.id && drag.id !== one.id ? ` is-drop-${drag.place}` : '';
        let marker: ReactNode = null;
        if (one.type === 'bullet') marker = <span className="sp-marker">{BULLETS[indent % BULLETS.length]}</span>;
        if (one.type === 'numbered') marker = <span className="sp-marker sp-number">{numberOf(blocks, index)}.</span>;
        if (one.type === 'todo') {
          marker = (
            <input
              type="checkbox"
              className="sp-check"
              aria-label={`Done: ${plainOf(one.text) || 'to-do'}`}
              checked={Boolean(one.checked)}
              disabled={disabled}
              onChange={(event) => patch(one.id, { checked: event.target.checked })}
            />
          );
        }
        if (one.type === 'toggle') {
          marker = (
            <button
              type="button"
              className="sp-caret"
              aria-expanded={!one.collapsed}
              aria-label={`${one.collapsed ? 'Open' : 'Close'} ${plainOf(one.text) || 'toggle'}`}
              disabled={disabled}
              onClick={() => patch(one.id, { collapsed: !one.collapsed })}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5 8 6l-4 3.5z" fill="currentColor" /></svg>
            </button>
          );
        }
        if (one.type === 'callout') marker = <span className="sp-marker sp-callout-icon" aria-hidden="true">💡</span>;

        return (
          <div
            key={one.id}
            className={`sp-block sp-b-${one.type}${one.checked ? ' is-checked' : ''}${dropping}`}
            style={{ '--indent': indent } as CSSProperties}
            onDragOver={(event) => {
              if (!drag) return;
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              const place = event.clientY < box.top + box.height / 2 ? 'before' : 'after';
              if (drag.over !== one.id || drag.place !== place) setDrag({ ...drag, over: one.id, place });
            }}
            onDrop={(event) => {
              if (!drag) return;
              event.preventDefault();
              onChange(moveTo(blocks, drag.id, one.id, drag.place));
              setDrag(null);
            }}
          >
            {!disabled && (
              <div className="sp-gutter">
                <button
                  type="button"
                  className="sp-add"
                  aria-label="Add a block below"
                  title="Add a block below"
                  onClick={() => addBelow(one.id, 'text', true)}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>
                <button
                  type="button"
                  className="sp-grip"
                  draggable
                  aria-label="Drag to move, or click for options"
                  title="Drag to move · Click for options"
                  aria-haspopup="menu"
                  aria-expanded={menu === one.id}
                  onClick={() => setMenu(menu === one.id ? null : one.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', one.id);
                    const row = event.currentTarget.closest('.sp-block');
                    if (row) event.dataTransfer.setDragImage(row, 20, 16);
                    setMenu(null);
                    setDrag({ id: one.id, over: null, place: 'after' });
                  }}
                  onDragEnd={() => setDrag(null)}
                >
                  <svg viewBox="0 0 10 16" aria-hidden="true">
                    {[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}
                  </svg>
                </button>
              </div>
            )}

            {marker}

            {one.type === 'divider' ? (
              <div
                className="sp-divider"
                role="separator"
                tabIndex={disabled ? -1 : 0}
                aria-label="Divider"
                ref={(node) => {
                  if (node) nodes.current.set(one.id, node);
                  else nodes.current.delete(one.id);
                }}
                onKeyDown={(event) => dividerKey(event, one)}
              >
                <hr />
              </div>
            ) : (
              (() => {
                const props: FieldProps = {
                  one,
                  disabled,
                  placeholder: lone ? "Write anything, or type '/' for commands" : PLACEHOLDER[one.type],
                  register: (node) => {
                    if (node) nodes.current.set(one.id, node);
                    else nodes.current.delete(one.id);
                  },
                  onEdit: (value, caret) => edit(one, value, caret),
                  onKey: (event) => key(event, one),
                  onPaste: (event) => paste(event, one),
                  onBlur: () => {
                    if (slash?.id === one.id) setSlash(null);
                  },
                };
                return isRich(one) ? <RichField {...props} /> : <Field {...props} />;
              })()
            )}

            {one.type === 'toggle' && !one.collapsed && !hasChildren(blocks, index) && !disabled && (
              <button type="button" className="sp-toggle-empty" onClick={() => addBelow(one.id)}>
                Empty toggle. Click to add a block inside.
              </button>
            )}

            {slash?.id === one.id && <SlashMenu query={slash.query} index={slash.index} onPick={choose} onHover={(i) => setSlash({ ...slash, index: i })} />}
            {menu === one.id && (
              <BlockMenu
                one={one}
                onClose={() => setMenu(null)}
                onTurn={(type) => {
                  setMenu(null);
                  if (type === 'divider') {
                    const after = block('text', one.text, one.indent ? { indent: one.indent } : {});
                    onChange(blocks.flatMap((row) => (row.id === one.id ? [retype(one, 'divider'), ...(one.text ? [after] : [])] : [row])));
                    return;
                  }
                  swap(one.id, retype(one, type));
                  setFocus({ id: one.id, at: 'end' });
                }}
                onDuplicate={() => {
                  setMenu(null);
                  const made = duplicate(blocks, one.id);
                  onChange(made.blocks);
                  if (made.copy) setFocus({ id: made.copy, at: 'end' });
                }}
                onUp={() => {
                  setMenu(null);
                  onChange(moveUp(blocks, one.id));
                }}
                onDown={() => {
                  setMenu(null);
                  onChange(moveDown(blocks, one.id));
                }}
                onDelete={() => {
                  setMenu(null);
                  const above = neighbour(one.id, -1);
                  onChange(remove(blocks, one.id));
                  if (above) setFocus({ id: above.id, at: 'end' });
                }}
              />
            )}
          </div>
        );
      })}
      {!disabled && <button type="button" className="sp-tail" aria-label="Write at the end of the page" onClick={tail} />}
      {/* Last, so it never takes the first block's place as :first-child. */}
      {bar && !disabled && (() => {
        const one = blocks.find((row) => row.id === bar.id);
        const node = nodes.current.get(bar.id);
        if (!one || !node) return null;
        const { start, end } = selectionOf(node, plainOf(one.text));
        return (
          <div className="sp-inline-bar" role="toolbar" aria-label="Text style" style={{ top: bar.top, left: bar.left }}>
            {(['bold', 'italic'] as const).map((which) => (
              <button
                key={which}
                type="button"
                className={`sp-inline-btn is-${which}`}
                aria-label={which === 'bold' ? 'Bold' : 'Italic'}
                title={which === 'bold' ? 'Bold · ⌘B' : 'Italic · ⌘I'}
                aria-pressed={hasMark(one.text, start, end, which)}
                // Keeps the selection: a click would otherwise clear it first.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => mark(bar.id, which)}
              >
                {which === 'bold' ? 'B' : 'I'}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// --------------------------------------------------------------------------
// One block's text
// --------------------------------------------------------------------------
interface FieldProps {
  one: Block;
  disabled: boolean;
  placeholder: string;
  register: (node: HTMLTextAreaElement | HTMLDivElement | null) => void;
  /** The block's new text as stored, and the caret as a visible offset. */
  onEdit: (value: string, caret: number) => void;
  onKey: (event: KeyboardEvent<HTMLElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLElement>) => void;
  onBlur: () => void;
}

const labelOf = (one: Block) => BLOCK_KINDS.find((kind) => kind.type === one.type)?.label ?? 'Text';

/**
 * A block's words with their bold and italic showing, edited in place.
 *
 * The field owns its DOM while the reader types: each input is read back
 * (./richDom) into Markdown and handed up, and the DOM is only rewritten when
 * the text arriving from above is not the text the field last produced — an
 * edit the editor made itself, like a split, a join or a new mark. Rewriting
 * on every keystroke would throw the caret to the start each time.
 */
function RichField({ one, disabled, placeholder, register, onEdit, onKey, onPaste, onBlur }: FieldProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  /** The Markdown the DOM is showing right now. */
  const shown = useRef<string | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || shown.current === one.text) return;
    node.innerHTML = toHtml(one.text);
    shown.current = one.text;
  }, [one.text]);

  const input = () => {
    const node = ref.current;
    if (!node) return;
    const text = serialize(readDom(node));
    shown.current = text;
    onEdit(text, selectionIn(node)?.start ?? plainOf(text).length);
  };

  return (
    <div
      ref={(node) => {
        ref.current = node;
        register(node);
      }}
      className={`sp-field sp-rich${one.text === '' ? ' is-blank' : ''}`}
      data-block={one.id}
      data-placeholder={placeholder}
      role="textbox"
      aria-multiline="true"
      aria-label={labelOf(one)}
      aria-disabled={disabled || undefined}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck
      onInput={input}
      onKeyDown={onKey}
      onPaste={onPaste}
      onBlur={onBlur}
    />
  );
}

/** A textarea that grows with what is in it, so a block is as tall as its words. Code only. */
function Field({ one, disabled, placeholder, register, onEdit, onKey, onBlur }: FieldProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fit = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${node.scrollHeight}px`;
  }, []);
  useLayoutEffect(fit, [fit, one.text, one.type]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  return (
    <textarea
      ref={(node) => {
        ref.current = node;
        register(node);
      }}
      className="sp-field"
      rows={1}
      value={one.text}
      placeholder={placeholder}
      aria-label={labelOf(one)}
      spellCheck={false}
      disabled={disabled}
      onChange={(event) => onEdit(event.target.value, event.target.selectionStart)}
      onKeyDown={onKey}
      onBlur={onBlur}
    />
  );
}

// --------------------------------------------------------------------------
// Menus
// --------------------------------------------------------------------------
function SlashMenu({
  query,
  index,
  onPick,
  onHover,
}: {
  query: string;
  index: number;
  onPick: (type: BlockType) => void;
  onHover: (index: number) => void;
}) {
  const options = matchKinds(query);
  const list = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);
  return (
    <div className="sp-pop sp-slash" role="listbox" aria-label="Block kinds" ref={list}>
      <p className="sp-pop-head">{query ? `Blocks matching “${query}”` : 'Basic blocks'}</p>
      {options.length === 0 && <p className="sp-pop-none">No results</p>}
      {options.map((kind, i) => (
        <div
          key={kind.type}
          role="option"
          aria-selected={i === Math.min(index, options.length - 1)}
          className="sp-pop-item"
          // Keeps the caret in the block while the menu is clicked.
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(kind.type)}
        >
          <span className="sp-pop-glyph" aria-hidden="true">{kind.glyph}</span>
          <span className="sp-pop-words">
            <span className="sp-pop-label">{kind.label}</span>
            <span className="sp-pop-hint">{kind.hint}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function BlockMenu({
  one,
  onClose,
  onTurn,
  onDuplicate,
  onUp,
  onDown,
  onDelete,
}: {
  one: Block;
  onClose: () => void;
  onTurn: (type: BlockType) => void;
  onDuplicate: () => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const ref = useDismiss(true, onClose);
  return (
    <div className="sp-pop sp-block-menu" role="menu" aria-label="Block options" ref={ref}>
      <button type="button" role="menuitem" className="sp-pop-item" onClick={onDuplicate}>
        <span className="sp-pop-label">Duplicate</span><kbd>⌘D</kbd>
      </button>
      <button type="button" role="menuitem" className="sp-pop-item" onClick={onUp}>
        <span className="sp-pop-label">Move up</span>
      </button>
      <button type="button" role="menuitem" className="sp-pop-item" onClick={onDown}>
        <span className="sp-pop-label">Move down</span>
      </button>
      <button type="button" role="menuitem" className="sp-pop-item is-danger" onClick={onDelete}>
        <span className="sp-pop-label">Delete</span>
      </button>
      <p className="sp-pop-head">Turn into</p>
      <div className="sp-turn">
        {BLOCK_KINDS.map((kind) => (
          <button
            key={kind.type}
            type="button"
            role="menuitemradio"
            aria-checked={kind.type === one.type}
            className="sp-turn-item"
            title={kind.label}
            onClick={() => onTurn(kind.type)}
          >
            <span className="sp-pop-glyph" aria-hidden="true">{kind.glyph}</span>
            <span>{kind.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { useDismiss };
