/**
 * Notes — the one thing you write here that the app will not score.
 *
 * Every other page turns what you did into a number: a task has an XP value, a
 * goal has a percentage, a finished task gets two stars. That is the app's
 * whole argument, and it has a hole in it — Summit can tell you that you worked
 * eleven days running and cannot tell you why the eleventh was the one where
 * it clicked. This is where that sentence goes.
 *
 * So there is no XP for writing one, no streak of days written, and no count of
 * notes anywhere near the report card. The moment a note is worth points it
 * stops being the honest one, and the reader starts writing for the counter.
 *
 * ## The shape
 *
 * A workspace, in three columns: an index on the left, the note in the middle,
 * and what is true about it on the right. The editor is always showing
 * something — a note or a blank one. There is no "click a note to begin" state
 * because the first thing anybody does here is write, and a page whose main
 * panel is empty until you find the right button has put a step in front of
 * the only thing it does.
 *
 * ## Saving is still explicit
 *
 * The status pill reads like autosave and is not. Autosave is right for a
 * document you are living in and wrong for a panel that also holds a delete
 * button; the draft stays local until saved, and the list only moves once the
 * server has answered. What the pill does is stop the page being quiet about
 * it — "Unsaved changes" is a state the old footer only expressed by whether a
 * button happened to be disabled.
 *
 * ## The toolbar writes Markdown
 *
 * Not a rich-text engine. The body is a plain-text column in the database and
 * turning it into a document model is a migration, not a button — so the
 * toolbar does what a person would do by hand: wraps the selection in
 * asterisks, puts `## ` at the front of the line. That keeps the note readable
 * as itself, which is the property a notes table should not lose to a format
 * only this page can open.
 *
 * That rule is what decided the shape of the colours, the highlighters, the
 * faces and the alignment when they arrived. Every one of them is a button
 * that writes something a person could have typed — `[urgent]{red}`,
 * `==this==`, `A title {center}` — and utils/markdown reads it back. Nothing
 * here holds formatting state, because there is nowhere to hold it: the note
 * is its text, and what you see in the write pane is the whole document.
 *
 * This file used to claim that shape could not give a live toolbar — that
 * knowing what the caret is standing in would mean reading formatting out of a
 * `<textarea>`, which reports none. That was wrong, and worth writing down
 * because it is the kind of wrong that looks like a constraint: the textarea is
 * not the document. The text is, a span is `[...]{...}`, and the caret is an
 * offset into it. `tokensAt` reads it, so the font and size selectors show what
 * is under the caret and the two palette buttons wear the colour that is
 * actually there.
 *
 * It matters more than a nicety. A control whose label never changes when you
 * use it is indistinguishable from one that does nothing — which is how the
 * font selector came to be reported as missing while it was on the screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Ambient, ErrorState, Loading, PageHero } from '@/components';
import { useAuth, useDocumentTitle, usePageEntrance, useSubjects } from '@/hooks';
import { notes as noteService } from '@/services';
import {
  NotebookPicker,
  SubjectPill,
  SubjectTags,
  subjectOf,
} from '@/components/Notes/SubjectTags';
import type { Note } from '@/services/notes';
import { isoDate } from '@/utils/dates';
import { render } from '@/utils/markdown';
import '@/styles/notes.css';
import { Icon } from '@/components/Icon';

/** A draft that has never been saved. Its id is empty, which is what `save` reads. */
const BLANK = {
  id: '',
  title: '',
  body: '',
  note_date: '',
  subject_ids: '',
  notebook: '',
  pinned: false,
};

type Draft = typeof BLANK;

const asDraft = (note: Note): Draft => ({
  id: note.id,
  title: note.title,
  body: note.body,
  note_date: note.note_date ?? '',
  subject_ids: note.subject_ids ?? '',
  notebook: note.notebook ?? '',
  pinned: Boolean(note.pinned),
});

/**
 * A note's subject ids, as a list.
 *
 * The column is absent on every note older than it, and null-ish on some rows
 * ALTER TABLE filled in — so this is the only place the string is split, and
 * everything else takes the array.
 */
export function subjectIds(value: string | undefined | null): string[] {
  return (value ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}

/**
 * The tokens of the `[...]{...}` span the caret is sitting in, if it is in one.
 *
 * The font and size buttons used to be labels: "Font" and "14", whatever you
 * had picked and wherever the caret was. Press one, pick Lora, and the button
 * still said "Font" — which is indistinguishable from a control that does
 * nothing, and is what "the font selector is gone" turned out to mean.
 *
 * A `<textarea>` reports no formatting, and that is what the docstring at the
 * top of this file said made a live label impossible. It was wrong: the
 * textarea is not the document. The *text* is, and the text is right here — a
 * span is `[...]{...}` and the caret is an offset into it. So the label reads
 * what is actually under the caret rather than what was last pressed, and is
 * right after an undo, after clicking somewhere else, and on a note opened
 * fresh.
 *
 * Exported for its tests: it is the one piece of this page that is a pure
 * function of two arguments, and the one worth pinning down.
 */
export function tokensAt(body: string, at: number): string[] {
  const spans = /\[([^\]\n]+)\]\{([^}\n]*)\}/g;
  let found: RegExpExecArray | null;
  while ((found = spans.exec(body)) !== null) {
    // Inside, not merely touching: a caret resting against the `[` belongs to
    // the text before the span, which is what you are about to type into.
    if (at > found.index && at < found.index + found[0].length) {
      return found[2]!.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    }
  }
  return [];
}

/** How many body edits back the toolbar's undo can reach. */
const HISTORY = 60;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "3h ago", "2d ago" — how the index says when.
 *
 * The list is scanned rather than read, and at that speed a distance is worth
 * more than a date: "2d ago" places a note against today without the reader
 * having to work out what today is. The full date is on the note itself, in
 * the rail, where somebody is actually looking at one thing.
 */
function ago(iso: string): string {
  const at = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(at.getTime())) return '';
  const gap = Date.now() - at.getTime();
  if (gap < 2 * MINUTE) return 'just now';
  if (gap < HOUR) return `${Math.round(gap / MINUTE)}m ago`;
  if (gap < DAY) return `${Math.round(gap / HOUR)}h ago`;
  if (gap < 7 * DAY) return `${Math.round(gap / DAY)}d ago`;
  if (gap < 30 * DAY) return `${Math.round(gap / (7 * DAY))}w ago`;
  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Jul 18, 2024, 10:32 AM" — the rail's full stamp, where there is room for one. */
function stamp(iso: string): string {
  const at = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const words = (body: string) => body.trim() ? body.trim().split(/\s+/).length : 0;

// ---------------------------------------------------------------------------
// The toolbar
// ---------------------------------------------------------------------------
/**
 * One button's effect on the text.
 *
 * `wrap` puts the same string either side of the selection — bold, italic,
 * code. `prefix` puts one at the front of every selected line — headings,
 * lists, quotes.
 *
 * Those two were once the whole vocabulary, and the comment here used to say
 * so. Colour, highlight, font and alignment do not fit either: a colour wraps
 * the selection in *different* strings, and an alignment belongs to the line
 * and has to survive being applied twice. So there are four kinds now:
 *
 *   `span`    `[selection]{tokens}` — colour, highlight, face, size
 *   `attr`    a `{token}` at the end of the line — alignment
 *   `shift`   two spaces on or off the front — list depth
 *
 * All of them still write Markdown that reads as itself, which is the rule
 * that decides what may be added here. See utils/markdown for the vocabulary
 * and for why the token list is fixed.
 */
type Tool =
  | { id: string; label: ReactNode; hint: string; wrap: string; text?: string }
  | { id: string; label: ReactNode; hint: string; prefix: string; text?: string }
  | { id: string; label: ReactNode; hint: string; text: string }
  | { id: string; label: ReactNode; hint: string; span: string }
  | { id: string; label: ReactNode; hint: string; attr: string }
  | { id: string; label: ReactNode; hint: string; shift: 1 | -1 };

/**
 * The eight buttons whose meaning is a shape rather than a character.
 *
 * `⬅` and `➡` are emoji on macOS and Windows both — they arrive in colour, at
 * the wrong weight, in a toolbar where every other glyph is monochrome text.
 * Alignment and depth are the two things here a letter cannot say, so they are
 * drawn: four lines with the short one moved, and an arrow against a wall.
 */
function Lines({ at }: { at: 'left' | 'center' | 'right' }) {
  // The second and fourth lines are short; where they sit is the whole icon.
  const short = { left: '2 8', center: '5 8', right: '8 8' }[at];
  return (
    <svg viewBox="0 0 18 14" className="nt-glyph" aria-hidden="true">
      {[2, 5.5, 9, 12.5].map((y, row) => {
        const isShort = row % 2 === 1;
        const [x, width] = isShort ? short.split(' ') : ['2', '14'];
        return <rect key={y} x={x} y={y} width={width} height="1.6" rx=".8" />;
      })}
    </svg>
  );
}

function Depth({ into }: { into: boolean }) {
  return (
    <svg viewBox="0 0 18 14" className="nt-glyph" aria-hidden="true">
      <rect x={into ? '2' : '6'} y="2" width={into ? '14' : '10'} height="1.6" rx=".8" />
      <rect x={into ? '2' : '6'} y="10.4" width={into ? '14' : '10'} height="1.6" rx=".8" />
      <path
        d={into ? 'M3 4.6 L7 7 L3 9.4 Z' : 'M15 4.6 L11 7 L15 9.4 Z'}
        className="nt-glyph-fill"
      />
    </svg>
  );
}

const TOOLS: Tool[][] = [
  [
    { id: 'bold', label: 'B', hint: 'Bold', wrap: '**' },
    { id: 'italic', label: 'I', hint: 'Italic', wrap: '*' },
    { id: 'under', label: 'U', hint: 'Underline', wrap: '__' },
    { id: 'strike', label: 'S', hint: 'Strikethrough', wrap: '~~' },
    { id: 'mark', label: '▮', hint: 'Highlight', wrap: '==' },
  ],
  [
    { id: 'bullet', label: '•', hint: 'Bulleted list', prefix: '- ' },
    { id: 'number', label: '1.', hint: 'Numbered list', prefix: '1. ' },
    { id: 'letter', label: 'a.', hint: 'Lettered list', prefix: 'a. ' },
    { id: 'roman', label: 'i.', hint: 'Roman list', prefix: 'i. ' },
    { id: 'todo', label: <Icon name="checklist" />, hint: 'Checklist', prefix: '- [ ] ' },
  ],
  [
    { id: 'outdent', label: <Depth into={false} />, hint: 'Move out one level', shift: -1 },
    { id: 'indent', label: <Depth into />, hint: 'Move in one level', shift: 1 },
  ],
  [
    { id: 'left', label: <Lines at="left" />, hint: 'Align left', attr: 'left' },
    { id: 'centre', label: <Lines at="center" />, hint: 'Centre', attr: 'center' },
    { id: 'right', label: <Lines at="right" />, hint: 'Align right', attr: 'right' },
  ],
  [
    { id: 'quote', label: <Icon name="quote" />, hint: 'Quote', prefix: '> ' },
    { id: 'code', label: '</>', hint: 'Code', wrap: '`' },
    { id: 'rule', label: '—', hint: 'Divider', text: '\n---\n' },
    { id: 'link', label: <Icon name="link" />, hint: 'Link', text: '[text](https://)' },
  ],
];

/**
 * The swatches behind the two colour buttons, and the faces behind the third.
 *
 * The same nine names in both rows, because ink and highlighter are the same
 * decision made twice and a reader who has learned one row has learned the
 * other. `bg-` is the highlighter's prefix in the note text too, so what the
 * button writes is legible in the body afterwards.
 */
const INKS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink', 'grey'];

/** Face and size, which are spans like the colours and belong in the same menu. */
/**
 * `label` names the face in the menu, `short` on the button.
 *
 * "JetBrains Mono" in a toolbar control sets the width of everything beside
 * it, and the button is read at a glance by somebody who already knows which
 * five there are — the menu is where the full name earns its room.
 */
const FACES: Array<{ token: string; label: string; short: string }> = [
  { token: 'sans', label: 'Inter', short: 'Inter' },
  { token: 'serif', label: 'Lora', short: 'Lora' },
  { token: 'mono', label: 'JetBrains Mono', short: 'Mono' },
  { token: 'display', label: 'Playfair Display', short: 'Playfair' },
  { token: 'hand', label: 'Caveat', short: 'Caveat' },
];

/**
 * The size selector, which replaced the four heading buttons.
 *
 * A number is a thing everybody already knows how to read, and H1 against H3
 * is a question about this app rather than about the writing. Headings did not
 * go anywhere — `# ` still makes one, and the preview still styles four levels
 * — they are just no longer the only way to make a line bigger.
 *
 * Points rather than a scale relative to the body: a size selector that says
 * "18" and produces something other than 18 is a selector nobody can aim.
 */
const SIZES = [12, 14, 16, 18, 20, 24, 30, 36, 48];

/** What the body is set at, so the menu can show which entry is the plain one. */
const BASE_SIZE = 14;

/**
 * What the New Note chevron offers.
 *
 * Four, and deliberately not more: a template list long enough to browse is a
 * decision in front of the blank page, which is the thing this page exists to
 * put you in front of. Each one is a heading and the prompts that go under it,
 * in the Markdown the toolbar writes, so a template is a note like any other
 * from the moment it opens.
 */
const TEMPLATES: Array<{ id: string; label: string; hint: string; title: string; body: string }> = [
  {
    id: 'blank',
    label: 'Blank note',
    hint: 'Nothing in it',
    title: '',
    body: '',
  },
  {
    id: 'log',
    label: 'Daily log',
    hint: 'What happened, what is next',
    title: '',
    body: '## What I did\n\n- \n\n## What worked\n\n- \n\n## Tomorrow\n\n- [ ] ',
  },
  {
    id: 'problem',
    label: 'Problem log',
    hint: 'A problem and what it taught you',
    title: '',
    body:
      '## The problem\n\n\n## What I tried\n\n- \n\n## The idea I was missing\n\n\n' +
      '## What to remember\n\n- ',
  },
  {
    id: 'book',
    label: 'Book notes',
    hint: 'Chapter by chapter',
    title: '',
    body: '## Source\n\n\n## Key ideas\n\n- \n\n## Quotes\n\n> \n\n## What I disagree with\n\n- ',
  },
];

/** How the index is narrowed. `subject` carries the id being filtered to. */
type Filter = { kind: 'all' | 'pinned' | 'untagged' | 'subject'; id?: string };

export default function Notes() {
  useDocumentTitle('Notes');

  const { username } = useAuth();
  const [rows, setRows] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  /** Which toolbar palette is down: 'ink', 'mark', 'face', or none. */
  const [paletteOpen, setPaletteOpen] = useState<'ink' | 'mark' | 'face' | 'size' | null>(null);
  /** Where the caret is, so the two selectors can say what is under it. */
  const [caret, setCaret] = useState(0);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  /**
   * Whether the body is being written or read.
   *
   * A saved note with something in it opens read: you came back to it to look
   * at it, and the formatting is the point of having written it that way. A
   * blank one opens write, because there is nothing to read.
   */
  const [mode, setMode] = useState<'write' | 'read'>('write');
  /** Collapsed index sections, by name. Both open until one is shut. */
  const [shut, setShut] = useState<Record<string, boolean>>({});

  const catalogue = useSubjects(username);
  const tags = useMemo(() => subjectIds(draft.subject_ids), [draft.subject_ids]);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /** Body edits, for the toolbar's undo and redo. See HISTORY. */
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);

  const load = useCallback(async () => {
    if (!username) return;
    const result = await noteService.list();
    if (result.success) {
      setRows(result.notes);
      setError(null);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ⌘K / Ctrl-K puts the caret in the search box, which is what the hint in it
     promises. Bound on the page rather than on the input for the obvious
     reason: the whole point is to reach it from wherever you are. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* The "..." menu closes on the next click anywhere, the way every other menu
     in the app does — a menu that only closes on its own button is one the
     reader has to aim at twice. */
  useEffect(() => {
    if (!menuOpen && !tplOpen && !filterOpen && !paletteOpen) return;
    const close = () => {
      setMenuOpen(false);
      setTplOpen(false);
      setFilterOpen(false);
      setPaletteOpen(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [filterOpen, menuOpen, paletteOpen, tplOpen]);

  /*
   * The list is the server's ordering, filtered. Not re-sorted here: the API
   * puts pinned first and most-recently-touched next because that is the only
   * ordering this page ever wants, and a second sort on the client is how a
   * list stops agreeing with itself the moment one of the two changes.
   */
  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    return rows
      .filter((note) => {
        if (filter.kind === 'pinned') return note.pinned;
        if (filter.kind === 'untagged') return subjectIds(note.subject_ids).length === 0;
        if (filter.kind === 'subject') return subjectIds(note.subject_ids).includes(filter.id ?? '');
        return true;
      })
      .filter(
        (note) =>
          !needle ||
          note.title.toLowerCase().includes(needle) ||
          note.body.toLowerCase().includes(needle),
      );
  }, [filter, query, rows]);

  /** The subjects actually in use, for the filter menu. Nothing else is offered. */
  const inUse = useMemo(() => {
    const seen = new Map<string, number>();
    for (const note of rows ?? []) {
      for (const id of subjectIds(note.subject_ids)) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  /** What the index's header calls the current view. */
  const scopeLabel =
    filter.kind === 'pinned'
      ? 'Pinned'
      : filter.kind === 'untagged'
        ? 'Untagged'
        : filter.kind === 'subject'
          ? subjectOf(filter.id ?? '', catalogue)?.name ?? filter.id ?? 'Tagged'
          : 'All Notes';

  /** The index's two groups. Pinned notes are lifted out rather than marked. */
  const groups = useMemo(
    () => [
      { name: 'Pinned', notes: shown.filter((note) => note.pinned) },
      { name: 'Notes', notes: shown.filter((note) => !note.pinned) },
    ],
    [shown],
  );

  const dirty = useMemo(() => {
    if (!draft.id) return draft.title.trim() !== '' || draft.body.trim() !== '';
    const original = rows?.find((note) => note.id === draft.id);
    if (!original) return false;
    return (
      original.title !== draft.title ||
      original.body !== draft.body ||
      (original.note_date ?? '') !== draft.note_date ||
      (original.subject_ids ?? '') !== draft.subject_ids ||
      (original.notebook ?? '') !== draft.notebook ||
      Boolean(original.pinned) !== draft.pinned
    );
  }, [draft, rows]);

  /** Every body change goes through here, so undo has something to hold. */
  const setBody = useCallback((next: string, remember = true) => {
    setDraft((current) => {
      if (remember && current.body !== next) {
        past.current = [...past.current, current.body].slice(-HISTORY);
        future.current = [];
      }
      return { ...current, body: next };
    });
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (previous === undefined) return;
    past.current = past.current.slice(0, -1);
    setDraft((current) => {
      future.current = [...future.current, current.body].slice(-HISTORY);
      return { ...current, body: previous };
    });
  }, []);

  const redo = useCallback(() => {
    const next = future.current.at(-1);
    if (next === undefined) return;
    future.current = future.current.slice(0, -1);
    setDraft((current) => {
      past.current = [...past.current, current.body].slice(-HISTORY);
      return { ...current, body: next };
    });
  }, []);

  /**
   * Run a toolbar button against the selection.
   *
   * The caret is put back deliberately rather than left where the browser
   * drops it: typing bold and then having to find your place again is worse
   * than not having the button.
   */
  const apply = useCallback(
    (tool: Tool) => {
      // Formatting the text you cannot see is not a thing anybody means to do,
      // so a toolbar press in read mode goes back to write first.
      if (mode === 'read') {
        setMode('write');
        return;
      }
      const field = bodyRef.current;
      if (!field) return;
      const from = field.selectionStart;
      const to = field.selectionEnd;
      const body = draft.body;
      const picked = body.slice(from, to);

      let next: string;
      let caret: number;
      /* Where the selection lands afterwards. Equal to `caret` for everything
         that has no placeholder — which is what a collapsed caret is. */
      let anchor: number | null = null;

      /* Where the first selected line begins. Four of the five kinds work on
         whole lines rather than on the selection, so they all start here — a
         caret in the middle of a word still indents the line it is in. */
      const lineStart = body.lastIndexOf('\n', from - 1) + 1;
      /** Rewrite every line the selection touches. Returns, so `next` is provably set. */
      const overLines = (change: (line: string) => string): [string, number] => {
        const marked = body.slice(lineStart, to).split('\n').map(change).join('\n');
        return [body.slice(0, lineStart) + marked + body.slice(to), lineStart + marked.length];
      };

      if ('prefix' in tool) {
        [next, caret] = overLines((line) =>
          line.startsWith(tool.prefix) ? line.slice(tool.prefix.length) : tool.prefix + line,
        );
      } else if ('shift' in tool) {
        // Two spaces is one level, which is what the renderer counts.
        [next, caret] = overLines((line) =>
          tool.shift === 1 ? `  ${line}` : line.replace(/^ {1,2}|^\t/, ''),
        );
      } else if ('attr' in tool) {
        /* An alignment is one per line, so an existing one is replaced rather
           than appended — pressing centre and then right twice would otherwise
           leave a line claiming both. Pressing the one already there takes it
           off, the way the prefix buttons do. */
        const had = new RegExp(`\\s*\\{\\s*${tool.attr}\\s*\\}\\s*$`);
        const any = /\s*\{\s*(left|center|centre|right)\s*\}\s*$/;
        [next, caret] = overLines((line) =>
          had.test(line) ? line.replace(had, '') : `${line.replace(any, '')} {${tool.attr}}`,
        );
      } else if ('span' in tool) {
        /* Pressing a font with nothing selected used to write `[sans]{sans}`:
           the placeholder was the button's own hint, so the word the reader
           got was the name of the thing they had pressed. It is "text" now,
           and it arrives selected — the next keystroke replaces it, which is
           what pressing a font before typing was meant to do. */
        const inner = picked || tool.hint;
        const written = `[${inner}]{${tool.span}}`;
        next = body.slice(0, from) + written + body.slice(to);
        caret = from + written.length;
        if (!picked) {
          anchor = from + 1;
          caret = anchor + inner.length;
        }
      } else if ('text' in tool && !('wrap' in tool)) {
        next = body.slice(0, from) + tool.text + body.slice(to);
        caret = from + tool.text.length;
      } else {
        const inner = picked || tool.hint.toLowerCase();
        next = body.slice(0, from) + tool.wrap + inner + tool.wrap + body.slice(to);
        caret = from + tool.wrap.length + inner.length + tool.wrap.length;
        if (!picked) {
          anchor = from + tool.wrap.length;
          caret = anchor + inner.length;
        }
      }

      setBody(next);
      requestAnimationFrame(() => {
        field.focus();
        field.setSelectionRange(anchor ?? caret, caret);
      });
    },
    [draft.body, mode, setBody],
  );

  /**
   * What the caret is standing in, as the two selectors show it.
   *
   * Falls back to the note's own defaults rather than to a blank: text with no
   * span on it *is* Inter at 14, so saying so is not a guess.
   */
  const marks = useMemo(() => {
    const tokens = tokensAt(draft.body, caret);
    return {
      face: FACES.find((entry) => tokens.includes(entry.token)) ?? FACES[0]!,
      size: SIZES.find((value) => tokens.includes(`s${value}`)) ?? BASE_SIZE,
      /* The two palette buttons wore a fixed spectrum because the caret's own
         colour was thought to be unreadable. It is not — it is in the text. */
      ink: INKS.find((name) => tokens.includes(name)) ?? null,
      mark: INKS.find((name) => tokens.includes(`bg-${name}`)) ?? null,
    };
  }, [caret, draft.body]);

  /**
   * Take the ink or the highlighter back off the selection.
   *
   * Unwrapping is not the same job as wrapping and cannot be a `Tool`: the
   * text to remove is whatever colour happens to be there, which the button
   * does not know until it looks. So this reads the selection, drops the
   * `{...}` that holds a token of the right family, and unwraps `==` for the
   * highlighter's shorthand.
   *
   * It leaves a span alone when its tokens are of the other family, so taking
   * the highlight off `[x]{red bg-blue}` leaves the red where it was.
   */
  const strip = useCallback(
    (family: 'ink' | 'mark') => {
      const field = bodyRef.current;
      if (!field || mode === 'read') return;
      const from = field.selectionStart;
      const to = field.selectionEnd;
      const body = draft.body;
      const wanted = family === 'ink' ? /^(?!bg-)/ : /^bg-/;

      let picked = body.slice(from, to);
      if (family === 'mark') picked = picked.replace(/==([^=]+)==/g, '$1');
      picked = picked.replace(
        /\[([^\]]+)\]\{([^}\n]*)\}/g,
        (whole, label: string, raw: string) => {
          const kept = raw
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean)
            .filter((token) => !wanted.test(token));
          if (kept.length === raw.trim().split(/[\s,]+/).filter(Boolean).length) return whole;
          return kept.length > 0 ? `[${label}]{${kept.join(' ')}}` : label;
        },
      );

      const next = body.slice(0, from) + picked + body.slice(to);
      setBody(next);
      requestAnimationFrame(() => {
        field.focus();
        field.setSelectionRange(from, from + picked.length);
      });
    },
    [draft.body, mode, setBody],
  );

  /**
   * Bumped every time the reader is put in front of a *different* note, which
   * is what the editor's entrance animation is keyed to.
   *
   * A counter rather than the note's id, and set from the three handlers that
   * swap the note rather than from an effect watching `draft.id`, because that
   * id also changes the moment an unsaved note is first saved — and replaying
   * the entrance mid-sentence, under a cursor that is still in the textarea,
   * is not a note being opened. These three are the only places the answer to
   * "what am I looking at" changes.
   */
  const [beat, setBeat] = useState(0);
  const swap = useCallback(() => setBeat((count) => count + 1), []);

  /**
   * Whether the index is folded away to its toggle.
   *
   * Worth having on a page whose middle column is the one being written in:
   * the index is a column of titles, and once you are three paragraphs into a
   * note it is a list of the notes you are not writing. Folding it hands the
   * whole width to the note and is one click to get back.
   */
  const [indexShut, setIndexShut] = useState(false);

  const open = useCallback((note: Note) => {
    swap();
    past.current = [];
    future.current = [];
    setDraft(asDraft(note));
    setMessage(null);
    setSavedAt(null);
    setMode(note.body.trim() ? 'read' : 'write');
  }, [swap]);

  /** Open a new note with a template's text already in it. */
  const fromTemplate = useCallback((template: (typeof TEMPLATES)[number]) => {
    swap();
    past.current = [];
    future.current = [];
    setDraft({ ...BLANK, title: template.title, body: template.body });
    setMessage(null);
    setSavedAt(null);
    setMode('write');
    setTplOpen(false);
    titleRef.current?.focus();
  }, [swap]);

  const blank = useCallback(() => {
    swap();
    past.current = [];
    future.current = [];
    setDraft(BLANK);
    setMessage(null);
    setSavedAt(null);
    setMode('write');
    titleRef.current?.focus();
  }, [swap]);

  const submit = useCallback(async () => {
    if (!username || busy) return;
    if (draft.title.trim() === '' && draft.body.trim() === '') {
      setMessage('A note needs a title or something written in it.');
      return;
    }
    setBusy(true);
    const result = await noteService.save({
      ...(draft.id ? { id: draft.id } : {}),
      title: draft.title,
      body: draft.body,
      note_date: draft.note_date,
      subject_ids: draft.subject_ids,
      notebook: draft.notebook,
      pinned: draft.pinned,
    });
    setBusy(false);
    if (!result.success) {
      setMessage(result.message);
      return;
    }
    setDraft(asDraft(result.note));
    setMessage(null);
    setSavedAt(Date.now());
    await load();
  }, [busy, draft, load, username]);

  const discard = useCallback(async () => {
    if (!username || !draft.id || busy) return;
    setBusy(true);
    const result = await noteService.remove(draft.id);
    setBusy(false);
    if (!result.success) {
      setMessage(result.message);
      return;
    }
    blank();
    await load();
  }, [blank, busy, draft.id, load, username]);

  /* The arrival cascade. Bound to the read rather than to mount, so it
     starts when there is something to animate — see hooks/usePageEntrance. */
  const entering = usePageEntrance(!loading);

  if (loading) return <Loading label="Reading your notes" />;
  if (rows === null) {
    return <ErrorState message={error ?? 'Could not read your notes.'} onRetry={load} />;
  }

  const state = busy
    ? { tone: 'busy', text: 'Saving…' }
    : dirty
      ? { tone: 'dirty', text: 'Unsaved changes' }
      : savedAt
        ? { tone: 'saved', text: 'Saved just now' }
        : draft.id
          ? { tone: 'saved', text: `Updated ${ago(rows.find((n) => n.id === draft.id)?.updated_at ?? '')}` }
          : { tone: 'saved', text: 'New note' };

  return (
    <div className="nt-page">
      <Ambient />
      <div className={`nt-shell page-shell${entering ? ' pg-enter' : ''}`}>
        {/* ---- The page's own header ---- */}
        {/* Slate. Notes is the one page here that is not measuring anything, and
            a quiet sky is the honest one over it. */}
        <PageHero variant="notes" tone="slate">
          <header className="nt-head">
            <div className="nt-head-titles">
              <h1>Notes</h1>
              <p>Somewhere to think.</p>
            </div>

            <div className="nt-head-tools">
              <div className="nt-search-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef}
                  type="search"
                  className="nt-search"
                  placeholder="Search notes..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <kbd className="nt-kbd">⌘K</kbd>
              </div>

              <div className="nt-new-group">
                <button type="button" className="nt-new" onClick={blank}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  New Note
                </button>
                <div className="nt-menu-wrap">
                  <button
                    type="button"
                    className="nt-new-more"
                    aria-label="Start from a template"
                    aria-expanded={tplOpen}
                    title="Start from a template"
                    onClick={(event) => {
                      event.stopPropagation();
                      setTplOpen((on) => !on);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {tplOpen && (
                    <div className="nt-menu is-wide" onClick={(event) => event.stopPropagation()}>
                      {TEMPLATES.map((template) => (
                        <button key={template.id} type="button" onClick={() => fromTemplate(template)}>
                          <span>{template.label}</span>
                          <em>{template.hint}</em>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>
        </PageHero>

        <div className={`nt-body${indexShut ? ' is-shut' : ''}`}>
          {/* ---- The index ---- */}
          <aside className="nt-list-panel">
            <div className="nt-list-head">
              <button
                type="button"
                className="nt-icon-btn nt-collapse"
                onClick={() => setIndexShut((shut) => !shut)}
                title={indexShut ? 'Show the note list' : 'Hide the note list'}
                aria-label={indexShut ? 'Show the note list' : 'Hide the note list'}
                aria-expanded={!indexShut}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M19 12H5m0 0 6-6m-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <span className="nt-scope">
                {query.trim() ? `${shown.length} matching` : scopeLabel}
              </span>

              <div className="nt-menu-wrap">
                <button
                  type="button"
                  className={`nt-icon-btn${filter.kind !== 'all' ? ' is-on' : ''}`}
                  aria-label="Filter the index"
                  aria-expanded={filterOpen}
                  title="Filter the index"
                  onClick={(event) => {
                    event.stopPropagation();
                    setFilterOpen((on) => !on);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M3 6h18M6 12h12M10 18h4" strokeLinecap="round" />
                  </svg>
                </button>

                {filterOpen && (
                  <div className="nt-menu" onClick={(event) => event.stopPropagation()}>
                    {([
                      { kind: 'all', label: 'All notes' },
                      { kind: 'pinned', label: 'Pinned only' },
                      { kind: 'untagged', label: 'Untagged' },
                    ] as const).map((entry) => (
                      <button
                        key={entry.kind}
                        type="button"
                        className={filter.kind === entry.kind ? 'is-on' : ''}
                        onClick={() => {
                          setFilter({ kind: entry.kind });
                          setFilterOpen(false);
                        }}
                      >
                        {entry.label}
                      </button>
                    ))}

                    {/* Only the subjects actually on a note. A filter listing a
                        hundred subjects, ninety of which match nothing, is a
                        menu you scroll rather than a filter you use. */}
                    {inUse.length > 0 && <hr />}
                    {inUse.map(([id, count]) => (
                      <button
                        key={id}
                        type="button"
                        className={filter.kind === 'subject' && filter.id === id ? 'is-on' : ''}
                        onClick={() => {
                          setFilter({ kind: 'subject', id });
                          setFilterOpen(false);
                        }}
                      >
                        <span>{subjectOf(id, catalogue)?.name ?? id}</span>
                        <em>{count}</em>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="nt-sections">
              {shown.length === 0 ? (
                <p className="nt-list-empty">
                  {rows.length === 0
                    ? 'Nothing written yet. The panel beside this one is a blank note.'
                    : `No note matches “${query.trim()}”.`}
                </p>
              ) : (
                groups.map((group) =>
                  group.notes.length === 0 ? null : (
                    <section className="nt-sec" key={group.name}>
                      <button
                        type="button"
                        className={`nt-sec-head${shut[group.name] ? ' is-shut' : ''}`}
                        onClick={() => setShut((open) => ({ ...open, [group.name]: !open[group.name] }))}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{group.name}</span>
                        <em>{group.notes.length}</em>
                      </button>

                      {!shut[group.name] && (
                        <ul className="nt-list">
                          {group.notes.map((note) => (
                            <li key={note.id}>
                              <button
                                type="button"
                                className={`nt-item${note.id === draft.id ? ' is-open' : ''}`}
                                onClick={() => open(note)}
                              >
                                <span className="nt-item-top">
                                  <span className="nt-item-title">{note.title || 'Untitled'}</span>
                                  {note.pinned && (
                                    <span className="nt-pin" aria-label="Pinned">
                                      <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M14 2 9 7H5l4 4-5 9 9-5 4 4V15l5-5-4-4V2Z" />
                                      </svg>
                                    </span>
                                  )}
                                </span>
                                {/* The subjects, so the index says what a note is
                                    about before you open it — which is the
                                    whole reason for tagging one. */}
                                {subjectIds(note.subject_ids).length > 0 && (
                                  <span className="nt-item-tags">
                                    {subjectIds(note.subject_ids).slice(0, 3).map((id) => (
                                      <SubjectPill key={id} id={id} catalogue={catalogue} />
                                    ))}
                                    {subjectIds(note.subject_ids).length > 3 && (
                                      <span className="nt-item-more">
                                        +{subjectIds(note.subject_ids).length - 3}
                                      </span>
                                    )}
                                  </span>
                                )}

                                <span className="nt-item-meta">
                                  {note.notebook && (
                                    <span className="nt-chip">{note.notebook}</span>
                                  )}
                                  <span className="nt-item-when">Updated {ago(note.updated_at)}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ),
                )
              )}
            </div>
          </aside>

          {/* ---- The note ---- */}
          <section className="nt-editor">
            <header className="nt-editor-head">
              <input
                ref={titleRef}
                className="nt-title"
                placeholder="Untitled"
                value={draft.title}
                maxLength={200}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />

              <span className={`nt-state is-${state.tone}`}>
                <i aria-hidden="true" />
                {state.text}
              </span>

              <div className="nt-editor-tools">
                <button
                  type="button"
                  className={`nt-icon-btn${draft.pinned ? ' is-on' : ''}`}
                  aria-pressed={draft.pinned}
                  title={draft.pinned ? 'Pinned to the top of the index' : 'Pin to the top'}
                  onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}
                >
                  <svg viewBox="0 0 24 24" fill={draft.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m12 3 2.6 5.6 6.4.8-4.7 4.3 1.3 6.3L12 17l-5.6 3 1.3-6.3L3 9.4l6.4-.8L12 3Z" strokeLinejoin="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  className="nt-icon-btn"
                  disabled={!draft.id || busy}
                  title="Save this note"
                  aria-label="Save this note"
                  onClick={() => void submit()}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M5 12v7h14v-7M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="nt-menu-wrap">
                  <button
                    type="button"
                    className="nt-icon-btn"
                    aria-label="More"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuOpen((on) => !on);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.7" />
                      <circle cx="12" cy="12" r="1.7" />
                      <circle cx="19" cy="12" r="1.7" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <div className="nt-menu" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={blank}>Start a blank note</button>
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}
                      >
                        {draft.pinned ? 'Unpin' : 'Pin to the top'}
                      </button>
                      {/* Delete lives in here rather than beside Save. It is
                          the one irreversible control on the page and it does
                          not belong a few pixels from the one pressed most. */}
                      <button
                        type="button"
                        className="is-bad"
                        disabled={!draft.id || busy}
                        onClick={() => {
                          setMenuOpen(false);
                          void discard();
                        }}
                      >
                        Delete this note
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* ---- What the buttons write ---- */}
            <div className="nt-toolbar">
              {/* Face and size lead, where H1..H4 used to. They are the two
                  controls a writer reaches for before they have written
                  anything, and both are lists rather than buttons because
                  five faces and nine sizes is fourteen buttons nobody wants. */}
              <div className="nt-tool-group">
                <div className="nt-menu-wrap">
                  <button
                    type="button"
                    className={`nt-pick nt-pick-face${paletteOpen === 'face' ? ' is-on' : ''}`}
                    title="Font"
                    aria-label="Font"
                    aria-expanded={paletteOpen === 'face'}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPaletteOpen((open) => (open === 'face' ? null : 'face'));
                    }}
                  >
                    <span>{marks.face.short}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {paletteOpen === 'face' && (
                    <div className="nt-menu is-wide is-left" onClick={(event) => event.stopPropagation()}>
                      {FACES.map((face) => (
                        <button
                          key={face.token}
                          type="button"
                          className={`nt-face is-${face.token}${face.token === marks.face.token ? ' is-on' : ''}`}
                          onClick={() => {
                            setPaletteOpen(null);
                            apply({ id: face.token, label: '', hint: 'text', span: face.token });
                          }}
                        >
                          <span>{face.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="nt-menu-wrap">
                  <button
                    type="button"
                    className={`nt-pick nt-pick-size${paletteOpen === 'size' ? ' is-on' : ''}`}
                    title="Font size"
                    aria-label="Font size"
                    aria-expanded={paletteOpen === 'size'}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPaletteOpen((open) => (open === 'size' ? null : 'size'));
                    }}
                  >
                    <span>{marks.size}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {paletteOpen === 'size' && (
                    <div className="nt-menu nt-sizes is-left" onClick={(event) => event.stopPropagation()}>
                      {SIZES.map((size) => (
                        <button
                          key={size}
                          type="button"
                          className={size === marks.size ? 'is-on' : undefined}
                          onClick={() => {
                            setPaletteOpen(null);
                            apply({ id: `s${size}`, label: '', hint: 'text', span: `s${size}` });
                          }}
                        >
                          <span>{size}</span>
                          {size === BASE_SIZE && <em>normal</em>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {TOOLS.map((group, index) => (
                <div className="nt-tool-group" key={index}>
                  {group.map((tool) => (
                    <button
                      type="button"
                      key={tool.id}
                      className="nt-tool"
                      title={tool.hint}
                      aria-label={tool.hint}
                      data-tool={tool.id}
                      onClick={() => apply(tool)}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>
              ))}

              {/* ---- Ink, highlighter and face ----
                  Three menus rather than twenty-four more buttons. A palette is
                  a choice from a set the reader is already looking at, and a
                  row of nine coloured squares says that better than nine
                  buttons in a strip that already scrolls. */}
              <div className="nt-tool-group">
                {([
                  { key: 'ink', hint: 'Text colour', label: 'A' },
                  { key: 'mark', hint: 'Highlight', label: '▮' },
                ] as const).map((palette) => (
                  <div className="nt-menu-wrap" key={palette.key}>
                    <button
                      type="button"
                      className={`nt-tool nt-tool-swatch${paletteOpen === palette.key ? ' is-on' : ''}${
                        marks[palette.key] ? ' is-set' : ''
                      }`}
                      style={
                        marks[palette.key]
                          ? ({ '--sw': `var(--nt-ink-${marks[palette.key]})` } as CSSProperties)
                          : undefined
                      }
                      title={
                        marks[palette.key] ? `${palette.hint}: ${marks[palette.key]}` : palette.hint
                      }
                      aria-label={palette.hint}
                      aria-expanded={paletteOpen === palette.key}
                      data-tool={palette.key}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPaletteOpen((open) => (open === palette.key ? null : palette.key));
                      }}
                    >
                      {palette.label}
                    </button>
                    {paletteOpen === palette.key && (
                      <div className="nt-swatches" onClick={(event) => event.stopPropagation()}>
                        {INKS.map((ink) => {
                          const token = palette.key === 'ink' ? ink : `bg-${ink}`;
                          return (
                            <button
                              key={ink}
                              type="button"
                              className={`nt-swatch is-${palette.key}`}
                              style={{ '--sw': `var(--nt-ink-${ink})` } as CSSProperties}
                              title={ink}
                              aria-label={`${palette.hint}: ${ink}`}
                              onClick={() => {
                                setPaletteOpen(null);
                                apply({ id: token, label: '', hint: ink, span: token });
                              }}
                            />
                          );
                        })}
                        {/* Taking it off is a choice in the same menu as putting
                            it on, because the reader who wants it gone is
                            looking at the button that put it there. */}
                        <button
                          type="button"
                          className="nt-swatch-clear"
                          onClick={() => {
                            setPaletteOpen(null);
                            strip(palette.key === 'ink' ? 'ink' : 'mark');
                          }}
                        >
                          None
                        </button>
                      </div>
                    )}
                  </div>
                ))}

              </div>

              <div className="nt-tool-group nt-tool-end">
                <div className="nt-mode" role="group" aria-label="Write or read">
                  <button
                    type="button"
                    className={mode === 'write' ? 'is-on' : ''}
                    aria-pressed={mode === 'write'}
                    onClick={() => setMode('write')}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    className={mode === 'read' ? 'is-on' : ''}
                    aria-pressed={mode === 'read'}
                    onClick={() => setMode('read')}
                  >
                    Preview
                  </button>
                </div>

                <button
                  type="button"
                  className="nt-tool"
                  title="Undo"
                  aria-label="Undo"
                  onClick={undo}
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="nt-tool"
                  title="Redo"
                  aria-label="Redo"
                  onClick={redo}
                >
                  ↷
                </button>
              </div>
            </div>

            {/* ---- The note, and what is true about it ---- */}
            <div className={`nt-editor-body is-beat-${beat % 2}`}>
              {mode === 'read' ? (
                /* The rendered note. `render` escapes before it formats and
                   allows no tag it did not write itself — see
                   utils/markdown.ts, which is where the reasoning for that
                   lives rather than here. Double-click puts you back in the
                   text, which is what a reader who spots a typo will try. */
                <div
                  className="nt-preview"
                  onDoubleClick={() => setMode('write')}
                  dangerouslySetInnerHTML={{ __html: render(draft.body) }}
                />
              ) : (
                <textarea
                  ref={bodyRef}
                  className="nt-body-input"
                  placeholder="Write it here. Nothing on this page is counted, graded or shown anywhere else."
                  value={draft.body}
                  maxLength={20000}
                  onChange={(event) => {
                    setBody(event.target.value);
                    setCaret(event.target.selectionStart);
                  }}
                  /* Fires on every caret move and every selection change,
                     which is exactly when the two selectors' labels can go
                     stale. `onKeyUp` would miss a click and `onClick` would
                     miss the arrow keys. */
                  onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
                />
              )}

              <aside className="nt-meta">
                {/* Both are real columns now — see data/sql/notes.sql. Tags are
                    ids from the subject catalogue rather than free text, which
                    is what lets a note carry the same colour and the same name
                    the rest of Summit gives that subject. The reasoning is in
                    components/Notes/SubjectTags. */}
                <section className="nt-meta-sec">
                  <h3>Tags</h3>
                  <SubjectTags
                    ids={tags}
                    catalogue={catalogue}
                    disabled={busy}
                    onChange={(next) => setDraft({ ...draft, subject_ids: next.join(',') })}
                  />
                </section>

                <section className="nt-meta-sec">
                  <h3>Notebook</h3>
                  <NotebookPicker
                    value={draft.notebook}
                    catalogue={catalogue}
                    disabled={busy}
                    onChange={(next) => setDraft({ ...draft, notebook: next })}
                  />
                </section>

                {/* The one anchor the page does offer. The table also holds
                    task_id and goal_id, and both are reachable from the API —
                    they are not here because a note is attached from the
                    *task*, which is where somebody is standing when they want
                    one. */}
                <section className="nt-meta-sec">
                  <h3>About a day</h3>
                  <input
                    type="date"
                    className="nt-date"
                    value={draft.note_date}
                    max={isoDate()}
                    onChange={(event) => setDraft({ ...draft, note_date: event.target.value })}
                  />
                </section>

                <section className="nt-meta-sec">
                  <h3>Created</h3>
                  <p className="nt-meta-value">
                    {draft.id
                      ? stamp(rows.find((note) => note.id === draft.id)?.created_at ?? '')
                      : 'Not saved yet'}
                  </p>
                </section>

                <section className="nt-meta-sec">
                  <h3>Updated</h3>
                  <p className="nt-meta-value">
                    {draft.id
                      ? ago(rows.find((note) => note.id === draft.id)?.updated_at ?? '')
                      : '—'}
                  </p>
                </section>
              </aside>
            </div>

            <footer className="nt-editor-foot">
              {message && <span className="nt-message">{message}</span>}
              <span className="nt-count">{words(draft.body).toLocaleString()} words</span>
              <span className="nt-count">{draft.body.length.toLocaleString()} characters</span>
              <button
                type="button"
                className="nt-save"
                disabled={busy || !dirty}
                onClick={() => void submit()}
              >
                {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Save note'}
              </button>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
