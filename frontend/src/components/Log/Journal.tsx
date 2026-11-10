/**
 * The Log: a private journal Summit learns from. The Log page (pages/Log.tsx)
 * draws it, and so does a Log block on a space's page
 * (components/Spaces/panelViews), with every part working the same.
 *
 * Two columns. On the left, the entry being written: a title, the body in the
 * same rich editor Notes uses (components/Notes/RichEditor), a short toolbar
 * and Save. On the right, every past entry, searchable, newest first or
 * oldest. "What Summit has learned" (components/Log/LearnedPanel) opens over
 * it and lists what the entries taught, each removable.
 *
 * ## Nothing typed is lost
 *
 * Every change is written to this device first (components/Log/entry.ts) and
 * autosaved a moment after the typing stops. A failed save says so and keeps
 * the device copy; the next visit puts it back in the editor. Leaving the page
 * or opening another entry saves what's open.
 *
 * Nothing waits on the server either. Opening another entry or a new one is
 * instant: what was open saves in the background, and the list shows its new
 * words straight away. Pinning, marking (Milestone, Win...) and deleting show
 * at once and are put back, with a note, if the server says no.
 *
 * An entry can be pinned to the top of the list and carry marks. Search finds
 * words in titles and text, marks ("milestone") and dates ("oct 10"), and
 * shows them highlighted; the chips narrow the list to pinned entries or one
 * mark. / jumps to the search box.
 *
 * Saving never waits on the AI. The server reads the entry afterwards
 * (backend/tracking/journal.py), after a quiet spell for an autosave or
 * straight away on Save.
 */
import {
  Bold, ChevronRight, CircleCheck, Image, Italic, Link as LinkIcon, List, ListOrdered,
  NotebookPen, Pin, Plus, Search, Sparkles, Trash2, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RichEditor } from '@/components/Notes/RichEditor';
import { imageSelection, linkSelection, listSelection, markSelection } from '@/components/Notes/editing';
import { LearnedPanel } from '@/components/Log/LearnedPanel';
import { CheckIn, moodOf } from '@/components/Log/CheckIn';
import {
  MARKS, clearDraft, clock, entryDate, filterCounts, findEntries, highlight, markLabel, onlyFrom, plainText,
  previewOf, readDraft, writeDraft, type EntryFilter, type LocalDraft,
} from '@/components/Log/entry';
import { ErrorState, Loading } from '@/components/PageState';
import { useAuth } from '@/hooks';
import { log as logService } from '@/services';
import type { Entry, Insight, MarkKey } from '@/services/log';
import { toMarkdown } from '@/utils/htmlToMarkdown';
import { RULES } from '@/utils/sharedRules';
import '@/styles/notes.css';
import '@/styles/log.css';

/** How long after the typing stops an autosave goes out. */
const AUTOSAVE_MS = 1500;

/** How often the review panel checks for a reading that's on its way, and for how long. */
const POLL_MS = 4000;
const POLL_TRIES = 15;

interface Draft {
  id: string;
  title: string;
  body: string;
  /** The check-in (components/Log/CheckIn), or null when skipped. */
  mood: number | null;
  energy: number | null;
  /** Kept at the top of the list, and the marks it carries (Milestone...). */
  pinned: boolean;
  marks: MarkKey[];
}

const BLANK: Draft = { id: '', title: '', body: '', mood: null, energy: null, pinned: false, marks: [] };

/** What a save sends for the check-in: 0 clears a skipped one. */
const checkinOf = (draft: Draft) => ({ mood: draft.mood ?? 0, energy: draft.energy ?? 0 });

/**
 * What a save sends: the writing and the check-in, and for a new entry its
 * pin and marks too. An entry that exists has those set the moment they're
 * tapped (`flag`), so a save never sends a stale copy of them.
 */
const payload = (draft: Draft, final: boolean) => ({
  ...(draft.id ? { id: draft.id } : { pinned: draft.pinned, marks: draft.marks }),
  title: draft.title, body: draft.body, final, ...checkinOf(draft),
});

/** Whether two drafts would save the same writing. */
const sameDraft = (a: Draft, b: Draft) =>
  a.title === b.title && a.body === b.body && a.mood === b.mood && a.energy === b.energy;

const sameMarks = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, at) => key === b[at]);

type Status = 'empty' | 'unsaved' | 'saving' | 'saved' | 'failed';

/** The link or image box under the toolbar, with the selection it was opened on. */
interface Adding {
  kind: 'link' | 'image';
  range: Range | null;
  label: string;
}

/** Nothing to save. A check-in alone is something: a day with a mood and no words. */
const isBlank = (draft: Draft) =>
  draft.title.trim() === '' && draft.body.trim() === '' && draft.mood === null && draft.energy === null;

/** An entry from the server, as the editor holds it. */
const fromEntry = (entry: Entry): Draft => ({
  id: entry.id, title: entry.title, body: entry.body,
  mood: entry.mood ?? null, energy: entry.energy ?? null,
  pinned: Boolean(entry.pinned), marks: entry.marks ?? [],
});

/** A copy kept on this device, back in the editor's shape. */
const fromKept = (kept: LocalDraft): Draft => ({
  ...BLANK, id: kept.id ?? '', title: kept.title, body: kept.body, mood: kept.mood ?? null, energy: kept.energy ?? null,
});

/** The editor's draft, as this device keeps it. */
const toKept = (draft: Draft): LocalDraft => ({
  id: draft.id || undefined, title: draft.title, body: draft.body, mood: draft.mood, energy: draft.energy, at: Date.now(),
});

/** What each filter chip says. */
const filterLabel = (filter: EntryFilter): string =>
  filter === 'all' ? 'All' : filter === 'pinned' ? 'Pinned' : `${markLabel(filter)}s`;

/** A search's words marked where they turn up. */
function Hit({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((piece, at) =>
        piece.hit ? <mark key={at} className="lg-hit">{piece.text}</mark> : <span key={at}>{piece.text}</span>,
      )}
    </>
  );
}

/** The parts a Log block can leave out. The page shows them all. */
export interface JournalParts {
  /** The mood and energy row. */
  checkin: boolean;
  /** Past entries, with search and sort. */
  entries: boolean;
  /** The note that opens "What Summit has learned". */
  learned: boolean;
}

const EVERY_PART: JournalParts = { checkin: true, entries: true, learned: true };

export interface JournalProps {
  /**
   * On a space's page: no page heading, the caret isn't taken on load, ⌘S
   * and / only work from inside it, and the drawer and the delete box open
   * over the whole window.
   */
  embedded?: boolean;
  /** Keeps this Log's draft on this device apart from the page's (see entry.ts). */
  slot?: string;
  show?: JournalParts;
  /** Which entries the list opens on: all of them, the pinned ones, or one mark. */
  filter?: EntryFilter;
}

export function Journal({ embedded = false, slot = '', show = EVERY_PART, filter: startFilter = 'all' }: JournalProps) {
  const { username } = useAuth();
  const user = username ?? '';
  /* Where a save that failed after its entry was closed keeps the words. */
  const heldSlot = slot ? `${slot}-held` : 'held';

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [learning, setLearning] = useState(true);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(BLANK);
  /** Changes when a different entry is put in the editor, so it re-seeds. */
  const [editorKey, setEditorKey] = useState(0);
  const [status, setStatus] = useState<Status>('empty');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** An entry that was closed before its save landed, and the save failed. */
  const [held, setHeld] = useState<Draft | null>(null);

  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [filter, setFilter] = useState<EntryFilter>(startFilter);
  const [panel, setPanel] = useState(false);
  const [confirming, setConfirming] = useState<Entry | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [watch, setWatch] = useState(0);
  useEffect(() => setFilter(startFilter), [startFilter]);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* What's open and whether it's saved, for the moments that leave it. */
  const latest = useRef({ draft, status, user, slot, heldSlot, entries, insights });
  latest.current = { draft, status, user, slot, heldSlot, entries, insights };
  /* Bumped whenever a different entry goes in the editor: a save that comes
     back after that belongs to the entry it was sent for, not the open one. */
  const openToken = useRef(0);
  /* The save in flight and the id it comes back with, so a save sent after
     it for the same new entry updates that entry instead of making another. */
  const saving = useRef(false);
  const inflight = useRef<Promise<string | null> | null>(null);
  /* Entries closed with their words handed to a background save. */
  const stashed = useRef(new Set<number>());

  // ---- Loading -------------------------------------------------------------
  const load = useCallback(async () => {
    try {
      const result = await logService.list();
      if (!result.success) {
        setLoadError(result.message);
        return null;
      }
      setEntries(result.entries);
      setInsights(result.insights);
      setLearning(result.learning);
      const stuck = result.entries.filter((entry) => entry.learn_state === 'waiting').map((entry) => entry.id);
      setWaiting(stuck);
      setLoadError(null);
      // A reading a server restart dropped is queued again, then watched for.
      if (stuck.length > 0 && result.learning) {
        void logService.resume().then((resumed) => {
          if (resumed.success && resumed.resumed > 0) setWatch((beat) => beat + 1);
        }).catch(() => {});
      }
      return result.entries;
    } catch {
      setLoadError("Couldn't reach the server.");
      return null;
    }
  }, []);

  /* First load: put back a draft this device was holding, if there is one
     the server doesn't have (or one whose save failed after it was closed).
     Otherwise the editor opens empty and ready. */
  useEffect(() => {
    if (!user) return;
    void load().then((rows) => {
      let kept = readDraft(user, slot);
      if (!kept) {
        kept = readDraft(user, heldSlot);
        if (kept) {
          clearDraft(user, heldSlot);
          writeDraft(user, kept, slot);
        }
      }
      if (!kept) return;
      const keptDraft = fromKept(kept);
      if (isBlank(keptDraft)) return;
      const server = kept.id ? rows?.find((entry) => entry.id === kept.id) : undefined;
      if (kept.id && !server) {
        // Deleted somewhere else; keep the words as a new entry.
        setDraft({ ...keptDraft, id: '' });
      } else if (server && sameDraft(keptDraft, fromEntry(server))) {
        clearDraft(user, slot);
        return;
      } else {
        setDraft(server ? { ...keptDraft, pinned: Boolean(server.pinned), marks: server.marks ?? [] } : keptDraft);
      }
      setEditorKey((key) => key + 1);
      setStatus('unsaved');
      setMessage("Put back what you were writing last time. It'll save in a moment.");
    });
  }, [heldSlot, load, user, slot]);

  // The tab opens ready to type: the title has the caret once the page is in.
  const loaded = entries !== null;
  useEffect(() => {
    if (loaded && !embedded) titleRef.current?.focus();
  }, [embedded, loaded]);

  // ---- Keeping the list in step ---------------------------------------------
  /** A saved entry into the list. Its pin and marks here are the newer ones: they're set on their own. */
  const keep = useCallback((entry: Entry) => {
    setEntries((rows) => {
      const list = rows ?? [];
      const had = list.find((row) => row.id === entry.id);
      if (!had) return [entry, ...list];
      return list.map((row) => (row.id === entry.id ? { ...entry, pinned: had.pinned, marks: had.marks } : row));
    });
    if (entry.learn_state === 'waiting') {
      setWaiting((ids) => (ids.includes(entry.id) ? ids : [...ids, entry.id]));
    }
  }, []);

  /** Pin, unpin or re-mark an entry: shown at once, put back if the server says no. */
  const flag = useCallback(async (id: string, change: { pinned?: boolean; marks?: MarkKey[] }) => {
    const before = latest.current.entries?.find((row) => row.id === id);
    const apply = (values: { pinned?: boolean; marks?: MarkKey[] }) => {
      setEntries((rows) => (rows ?? []).map((row) => (row.id === id ? { ...row, ...values } : row)));
      setDraft((was) => (was.id === id ? { ...was, ...values } : was));
    };
    apply(change);
    try {
      const result = await logService.flag(id, change);
      if (!result.success) throw new Error(result.message);
    } catch {
      if (before) apply({ pinned: Boolean(before.pinned), marks: before.marks ?? [] });
      setMessage("Couldn't save that change. Try it again.");
    }
  }, []);

  // ---- Saving --------------------------------------------------------------
  const changeDraft = useCallback((next: Partial<Draft>) => {
    setDraft((was) => {
      const merged = { ...was, ...next };
      writeDraft(latest.current.user, toKept(merged), latest.current.slot);
      return merged;
    });
    setStatus('unsaved');
  }, []);

  /** Words that couldn't be saved after their entry was closed: kept here and on this device. */
  const strand = useCallback((lost: Draft) => {
    setHeld(lost);
    writeDraft(latest.current.user, toKept(lost), latest.current.heldSlot);
  }, []);

  const save = useCallback(async (final: boolean) => {
    const sent = latest.current.draft;
    if (isBlank(sent)) {
      if (final) setMessage('Write something first.');
      return;
    }
    if (saving.current) return;
    saving.current = true;
    const token = openToken.current;
    setStatus('saving');
    let landed: (id: string | null) => void = () => {};
    inflight.current = new Promise((resolve) => {
      landed = resolve;
    });
    try {
      const result = await logService.save(payload(sent, final));
      if (!result.success) {
        landed(null);
        if (token !== openToken.current) {
          if (!stashed.current.has(token)) strand(sent);
          return;
        }
        setStatus('failed');
        setMessage(`${result.message} Your writing is kept on this device.`);
        return;
      }
      const entry = result.entry;
      landed(entry.id);
      keep(entry);
      if (final) setWatch((beat) => beat + 1);
      // Another entry is open now; this one is saved and in the list.
      if (token !== openToken.current) return;
      setSavedAt(Date.now());
      setMessage(null);
      const now = latest.current.draft;
      setDraft((was) => ({ ...was, id: entry.id }));
      // A pin or mark tapped while a new entry's first save was on its way.
      if (Boolean(entry.pinned) !== now.pinned || !sameMarks(entry.marks ?? [], now.marks)) {
        void flag(entry.id, { pinned: now.pinned, marks: now.marks });
      }
      if (sameDraft(now, sent)) {
        setStatus('saved');
        clearDraft(latest.current.user, latest.current.slot);
      } else {
        // Typed on while it saved: the next autosave sends the rest.
        writeDraft(latest.current.user, { ...toKept(now), id: entry.id }, latest.current.slot);
        setStatus('unsaved');
      }
    } catch {
      landed(null);
      if (token !== openToken.current) {
        if (!stashed.current.has(token)) strand(sent);
        return;
      }
      setStatus('failed');
      setMessage("Couldn't reach the server. Your writing is kept on this device.");
    } finally {
      saving.current = false;
    }
  }, [flag, keep, strand]);

  /**
   * Save an entry that's no longer open, without making anyone wait for it.
   * The list shows the new words straight away; a failure keeps them on this
   * device and offers to open them again.
   */
  const stash = useCallback((sent: Draft, after: Promise<string | null> | null) => {
    if (sent.id) {
      setEntries((rows) => (rows ?? []).map((row) => (row.id === sent.id
        ? { ...row, title: sent.title, body: sent.body, mood: sent.mood, energy: sent.energy }
        : row)));
    }
    void (after ?? Promise.resolve(null)).then(async (made) => {
      const out = { ...sent, id: sent.id || made || '' };
      try {
        const result = await logService.save(payload(out, false));
        if (!result.success) throw new Error(result.message);
        keep(result.entry);
      } catch {
        strand(out);
      }
    });
  }, [keep, strand]);

  // The autosave: re-armed by every change, so it fires once the typing stops.
  useEffect(() => {
    if (status !== 'unsaved' || isBlank(draft)) return undefined;
    const timer = window.setTimeout(() => void save(false), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, save, status]);

  // Leaving the page saves what's open. The device copy is there if it fails.
  useEffect(() => () => {
    const { draft: leaving, status: was } = latest.current;
    if ((was === 'unsaved' || was === 'failed') && !isBlank(leaving)) {
      const after = saving.current ? inflight.current : null;
      void (after ?? Promise.resolve(null))
        .then((made) => logService.save(payload({ ...leaving, id: leaving.id || made || '' }, false)))
        .then((result) => {
          if (result.success) clearDraft(latest.current.user, latest.current.slot);
        })
        .catch(() => {});
    }
  }, []);

  /**
   * Show `next` in the editor, at once. What was open and unsaved goes on
   * saving in the background (after any save already on its way, so a new
   * entry is never made twice).
   */
  const switchTo = useCallback((next: Draft, nextStatus?: Status) => {
    const { status: was, draft: open } = latest.current;
    if ((was === 'unsaved' || was === 'failed') && !isBlank(open)) {
      stashed.current.add(openToken.current);
      stash(open, saving.current ? inflight.current : null);
    }
    openToken.current += 1;
    setDraft(next);
    setEditorKey((key) => key + 1);
    setStatus(nextStatus ?? (next.id ? 'saved' : 'empty'));
    setSavedAt(null);
    setMessage(null);
    setAdding(null);
    clearDraft(latest.current.user, latest.current.slot);
  }, [stash]);

  const openEntry = (entry: Entry) => {
    if (entry.id === latest.current.draft.id) return;
    switchTo(fromEntry(entry));
  };
  const newEntry = () => {
    switchTo(BLANK);
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };
  /** Back into the editor: words whose save failed after they were closed. */
  const reopenHeld = () => {
    if (!held) return;
    const words = held;
    setHeld(null);
    switchTo(words, 'unsaved');
    writeDraft(latest.current.user, toKept(words), latest.current.slot);
    clearDraft(latest.current.user, latest.current.heldSlot);
  };

  // ---- Pin and marks from the editor ----------------------------------------
  /* An entry that exists changes at once. A new one keeps them until its first save carries them. */
  const setFlags = (change: { pinned?: boolean; marks?: MarkKey[] }) => {
    const open = latest.current.draft;
    if (open.id) void flag(open.id, change);
    else setDraft((was) => ({ ...was, ...change }));
  };
  const togglePin = () => setFlags({ pinned: !latest.current.draft.pinned });
  const toggleMark = (key: MarkKey) => {
    const marks = latest.current.draft.marks;
    const on = marks.includes(key);
    setFlags({ marks: MARKS.map((mark) => mark.key).filter((one) => (one === key ? !on : marks.includes(one))) });
  };

  // ---- Deleting ------------------------------------------------------------
  /* Gone from the list the moment it's confirmed; back, with a note, if the server says no. */
  const confirmDelete = () => {
    if (!confirming) return;
    const gone = confirming;
    const insightsBefore = latest.current.insights;
    setConfirming(null);
    setEntries((rows) => (rows ?? []).filter((row) => row.id !== gone.id));
    setInsights((rows) => rows
      .filter((row) => !(row.sources.length === 1 && row.sources[0] === gone.id))
      .map((row) => ({ ...row, sources: row.sources.filter((id) => id !== gone.id) })));
    setWaiting((ids) => ids.filter((id) => id !== gone.id));
    if (latest.current.draft.id === gone.id) {
      openToken.current += 1;
      setDraft(BLANK);
      setEditorKey((key) => key + 1);
      setStatus('empty');
      setSavedAt(null);
      clearDraft(latest.current.user, latest.current.slot);
    }
    void logService.remove(gone.id)
      .then((result) => {
        if (!result.success) throw new Error(result.message);
      })
      .catch(() => {
        setEntries((rows) => (rows && !rows.some((row) => row.id === gone.id) ? [gone, ...rows] : rows));
        setInsights(insightsBefore);
        setMessage(`Couldn't delete "${gone.title.trim() || 'Untitled'}", so it's back in your list.`);
      });
  };

  // ---- What's been learned -------------------------------------------------
  /* After Save, and while the panel is open, check now and then for a reading
     that's on its way, until it lands or this gives up. */
  useEffect(() => {
    if ((!panel && watch === 0) || waiting.length === 0 || !learning) return undefined;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      try {
        const result = await logService.insights();
        if (result.success) {
          setInsights(result.insights);
          setWaiting(result.waiting);
          setLearning(result.learning);
          if (result.waiting.length === 0) window.clearInterval(timer);
        }
      } catch {
        /* try again next time */
      }
      if (tries >= POLL_TRIES) window.clearInterval(timer);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [learning, panel, waiting.length, watch]);

  const forget = useCallback(async (insight: Insight) => {
    try {
      const result = await logService.forget(insight.id);
      if (!result.success) return false;
      setInsights((rows) => rows.filter((row) => row.id !== insight.id));
      return true;
    } catch {
      return false;
    }
  }, []);

  // ---- The toolbar ---------------------------------------------------------
  const sync = useCallback(() => {
    const host = bodyRef.current;
    if (host) changeDraft({ body: toMarkdown(host) });
  }, [changeDraft]);

  const tool = (run: (host: HTMLElement) => void) => () => {
    const host = bodyRef.current;
    if (!host) return;
    host.focus();
    run(host);
    sync();
  };

  /** Open the link or image box, remembering the selection it applies to. */
  const startAdding = (kind: Adding['kind']) => {
    const host = bodyRef.current;
    const selection = window.getSelection();
    let range: Range | null = null;
    if (host && selection && selection.rangeCount > 0 && host.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      range = selection.getRangeAt(0).cloneRange();
    }
    setAdding({ kind, range, label: range?.toString() ?? '' });
    window.setTimeout(() => addRef.current?.focus(), 0);
  };

  const finishAdding = (raw: string) => {
    const host = bodyRef.current;
    if (!adding || !host) return;
    let url = raw.trim();
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|\/)/i.test(url)) url = `https://${url}`;
    if (adding.kind === 'image' && !/^https?:\/\//i.test(url)) {
      setMessage('An image needs a web address that starts with http.');
      return;
    }
    host.focus();
    const selection = window.getSelection();
    if (adding.range && selection) {
      selection.removeAllRanges();
      selection.addRange(adding.range);
    } else if (selection) {
      const end = document.createRange();
      end.selectNodeContents(host);
      end.collapse(false);
      selection.removeAllRanges();
      selection.addRange(end);
    }
    if (adding.kind === 'link') linkSelection(host, url, adding.label || url);
    else imageSelection(host, url, adding.label || 'Image');
    sync();
    setAdding(null);
  };

  // Cmd/Ctrl+S saves for real, and / jumps to the search. On a space's page,
  // only from inside this Log.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (embedded && !rootRef.current?.contains(target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save(true);
        return;
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && show.entries) {
        if (target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embedded, save, show.entries]);

  // ---- Drawing -------------------------------------------------------------
  const shown = useMemo(() => findEntries(entries ?? [], query, order, filter), [entries, filter, order, query]);
  const counts = useMemo(() => filterCounts(entries ?? []), [entries]);
  /* All, then Pinned and each mark that's on something (or picked). */
  const chips = (['all', 'pinned', ...MARKS.map((mark) => mark.key)] as EntryFilter[])
    .filter((key) => key === 'all' || key === filter || counts[key] > 0);
  const narrowed = query.trim() !== '' || filter !== 'all';
  const losing = confirming ? onlyFrom(insights, confirming.id).length : 0;
  const learnedCount = insights.filter((insight) => insight.status === 'active').length;

  if (loadError && !entries) {
    if (!embedded) return <ErrorState message={loadError} onRetry={() => void load()} />;
    return (
      <div className="lg-block">
        <p className="lg-message" role="alert">
          {loadError}{' '}
          <button type="button" className="lg-btn is-quiet" onClick={() => void load()}>Try again</button>
        </p>
      </div>
    );
  }
  if (!entries) {
    if (!embedded) return <Loading label="Loading your log" />;
    return <div className="lg-block"><p className="lg-empty">Loading your log…</p></div>;
  }

  const statusLine = (() => {
    if (status === 'saving') return <span className="lg-status is-saving">Saving…</span>;
    if (status === 'failed') return <span className="lg-status is-bad">Not saved</span>;
    if (status === 'unsaved') return <span className="lg-status">Unsaved</span>;
    if (status === 'saved' && savedAt) {
      return (
        <span className="lg-status is-good">
          <CircleCheck aria-hidden="true" /> Saved <time>{clock(savedAt)}</time>
        </span>
      );
    }
    if (status === 'saved') return <span className="lg-status is-good"><CircleCheck aria-hidden="true" /> Saved</span>;
    return null;
  })();

  const main = (
    <div className="lg-main">
      {!embedded && (
        <header className="lg-head">
          <span className="lg-mark" aria-hidden="true"><NotebookPen /></span>
          <div className="lg-head-text">
            <h1>Log</h1>
            <p>
              Write about your day, what you're working toward, or anything on your mind. Only you can
              see it. Summit reads it to make your plans and suggestions fit you better.
            </p>
          </div>
        </header>
      )}

      <section className="lg-editor" aria-label="Entry">
        <div className="lg-title-row">
          <input
            ref={titleRef}
            className="lg-title"
            value={draft.title}
            maxLength={RULES.log.title_max}
            placeholder="Give it a title"
            aria-label="Entry title"
            onChange={(event) => changeDraft({ title: event.target.value })}
          />
          <div role="status" aria-live="polite" className="lg-status-wrap">{statusLine}</div>
        </div>

        <div className="lg-flags" role="group" aria-label="Pin and mark this entry">
          <button
            type="button"
            className={`lg-flag is-pin${draft.pinned ? ' is-on' : ''}`}
            aria-pressed={draft.pinned}
            title={draft.pinned ? 'Pinned to the top of your entries' : 'Keep it at the top of your entries'}
            onClick={togglePin}
          >
            <Pin aria-hidden="true" /> {draft.pinned ? 'Pinned' : 'Pin'}
          </button>
          {MARKS.map((mark) => {
            const on = draft.marks.includes(mark.key);
            return (
              <button
                key={mark.key}
                type="button"
                className={`lg-flag is-${mark.key}${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleMark(mark.key)}
              >
                {mark.label}
              </button>
            );
          })}
        </div>

        {show.checkin && (
          <CheckIn
            mood={draft.mood}
            energy={draft.energy}
            onChange={(next) => changeDraft(next)}
          />
        )}

        <div className="lg-body">
          <RichEditor
            key={editorKey}
            value={draft.body}
            noteKey={`${editorKey}:${draft.id}`}
            readOnly={false}
            label="Entry"
            placeholder="Write whatever's on your mind…"
            onChange={(markdown) => changeDraft({ body: markdown })}
            onCaret={() => {}}
            innerRef={bodyRef}
          />
        </div>

        {adding && (
          <form
            className="lg-add"
            onSubmit={(event) => {
              event.preventDefault();
              finishAdding(addRef.current?.value ?? '');
            }}
          >
            <input
              ref={addRef}
              type="url"
              inputMode="url"
              placeholder={adding.kind === 'link' ? 'Paste a link' : 'Paste an image address'}
              aria-label={adding.kind === 'link' ? 'Link address' : 'Image address'}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setAdding(null);
              }}
            />
            <button type="submit" className="lg-btn">{adding.kind === 'link' ? 'Add link' : 'Add image'}</button>
            <button type="button" className="lg-btn is-quiet" onClick={() => setAdding(null)}>Cancel</button>
          </form>
        )}

        <div className="lg-tools">
          <div className="lg-toolbar" role="toolbar" aria-label="Formatting">
            <button type="button" aria-label="Bold" title="Bold" onMouseDown={(e) => e.preventDefault()}
              onClick={tool((host) => markSelection(host, 'bold'))}><Bold aria-hidden="true" /></button>
            <button type="button" aria-label="Italic" title="Italic" onMouseDown={(e) => e.preventDefault()}
              onClick={tool((host) => markSelection(host, 'italic'))}><Italic aria-hidden="true" /></button>
            <button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(e) => e.preventDefault()}
              onClick={tool((host) => listSelection(host, false))}><List aria-hidden="true" /></button>
            <button type="button" aria-label="Numbered list" title="Numbered list" onMouseDown={(e) => e.preventDefault()}
              onClick={tool((host) => listSelection(host, true))}><ListOrdered aria-hidden="true" /></button>
            <button type="button" aria-label="Link" title="Link" onMouseDown={(e) => e.preventDefault()}
              onClick={() => startAdding('link')}><LinkIcon aria-hidden="true" /></button>
            <button type="button" aria-label="Image" title="Image from the web" onMouseDown={(e) => e.preventDefault()}
              onClick={() => startAdding('image')}><Image aria-hidden="true" /></button>
          </div>
          <div className="lg-actions">
            {draft.id && (
              <button
                type="button"
                className="lg-btn is-quiet is-danger"
                onClick={() => {
                  const entry = entries.find((row) => row.id === draft.id);
                  if (entry) setConfirming(entry);
                }}
              >
                <Trash2 aria-hidden="true" /> Delete
              </button>
            )}
            <button
              type="button"
              className="lg-btn is-primary"
              disabled={status === 'saving'}
              onClick={() => void save(true)}
            >
              Save entry
            </button>
          </div>
        </div>
        {message && <p className="lg-message" role="alert">{message}</p>}
        {held && (
          <p className="lg-message" role="alert">
            Couldn't save "{held.title.trim() || 'Untitled'}". It's kept on this device.{' '}
            <button type="button" className="lg-btn is-quiet" onClick={reopenHeld}>Open it again</button>
          </p>
        )}
      </section>

      {show.learned && (
        <aside className="lg-note">
          <Sparkles aria-hidden="true" />
          <div>
            <strong>Your log helps Summit get to know you</strong>
            <p>
              Summit picks up your goals, interests and habits from what you write and uses them to shape
              your plans and suggestions. You can see all of it and remove anything.
            </p>
          </div>
          <button type="button" className="lg-link" onClick={() => setPanel(true)}>
            {learnedCount > 0 ? `See what Summit has learned (${learnedCount})` : 'See what Summit has learned'}
            <ChevronRight aria-hidden="true" />
          </button>
        </aside>
      )}
    </div>
  );

  const side = (
    <div className="lg-side">
      <div className="lg-side-head">
        <h2>
          Your entries
          {entries.length > 0 && <span className="lg-count">{entries.length}</span>}
        </h2>
        <button type="button" className="lg-btn" onClick={newEntry}>
          <Plus aria-hidden="true" /> New entry
        </button>
      </div>
      <div className="lg-find">
        <label className="lg-search">
          <Search aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search entries, marks or dates"
            aria-label="Search entries"
            title="Press / to search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault();
                setQuery('');
              }
            }}
          />
          {query && (
            <button type="button" className="lg-search-clear" aria-label="Clear the search" onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}>
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        <select
          className="lg-order"
          value={order}
          aria-label="Sort entries"
          onChange={(event) => setOrder(event.target.value as 'newest' | 'oldest')}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      {chips.length > 1 && (
        <div className="lg-filters" role="group" aria-label="Show">
          {chips.map((key) => (
            <button
              key={key}
              type="button"
              className={`lg-chip is-${key}${filter === key ? ' is-on' : ''}`}
              aria-pressed={filter === key}
              aria-label={`${filterLabel(key)}, ${counts[key]}`}
              onClick={() => setFilter(filter === key && key !== 'all' ? 'all' : key)}
            >
              {key === 'pinned' && <Pin aria-hidden="true" />}
              {filterLabel(key)}
              <span className="lg-chip-count">{counts[key]}</span>
            </button>
          ))}
        </div>
      )}

      {narrowed && entries.length > 0 && (
        <p className="lg-found" aria-live="polite">
          Showing {shown.length} of {entries.length}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="lg-empty">
          {entries.length === 0
            ? 'No entries yet. Save your first one and it shows up here.'
            : query.trim()
              ? 'No entries match that.'
              : filter === 'pinned'
                ? 'Nothing pinned yet. Pin an entry to keep it at the top.'
                : filter !== 'all'
                  ? `No ${filterLabel(filter).toLowerCase()} yet. Mark an entry from the editor.`
                  : 'No entries match that.'}
          {narrowed && entries.length > 0 && (
            <button type="button" className="lg-link lg-empty-reset" onClick={() => {
              setQuery('');
              setFilter('all');
            }}>
              Show all entries
            </button>
          )}
        </p>
      ) : (
        <ul className="lg-list" aria-label="Your entries">
          {shown.map((entry) => {
            const name = entry.title.trim() || (entry.mood && !entry.body.trim() ? 'Check-in' : 'Untitled');
            const preview = previewOf(plainText(entry.body), query);
            const marks = entry.marks ?? [];
            return (
              <li key={entry.id} className={`lg-row${entry.pinned ? ' is-pinned' : ''}`}>
                <button
                  type="button"
                  className={`lg-item${entry.id === draft.id ? ' is-on' : ''}`}
                  aria-current={entry.id === draft.id ? 'true' : undefined}
                  onClick={() => openEntry(entry)}
                >
                  <span className="lg-item-top">
                    {(() => {
                      const face = moodOf(entry.mood);
                      if (!face) return null;
                      const Icon = face.icon;
                      return (
                        <span className={`lg-item-mood is-m${face.value}`} title={face.label}>
                          <Icon aria-label={face.label} />
                        </span>
                      );
                    })()}
                    <strong><Hit text={name} query={query} /></strong>
                    <time dateTime={entry.created_at}>{entryDate(entry.created_at)}</time>
                  </span>
                  {marks.length > 0 && (
                    <span className="lg-item-tags">
                      {marks.map((key) => (
                        <span key={key} className={`lg-tag is-${key}`}>{markLabel(key)}</span>
                      ))}
                    </span>
                  )}
                  <span className="lg-item-preview">
                    {preview ? <Hit text={preview} query={query} /> : 'Nothing written yet.'}
                  </span>
                  <ChevronRight className="lg-chev" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`lg-pin${entry.pinned ? ' is-on' : ''}`}
                  aria-pressed={Boolean(entry.pinned)}
                  aria-label={entry.pinned ? `Unpin ${name}` : `Pin ${name}`}
                  title={entry.pinned ? 'Unpin' : 'Pin to the top'}
                  onClick={() => void flag(entry.id, { pinned: !entry.pinned })}
                >
                  <Pin aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const over = (
    <>
      {panel && (
        <LearnedPanel
          insights={insights}
          learning={learning}
          waiting={waiting.length}
          onRemove={forget}
          onClose={() => setPanel(false)}
        />
      )}

      {confirming && (
        <div className="lg-scrim is-center" onMouseDown={(event) => event.target === event.currentTarget && setConfirming(null)}>
          <div className="lg-confirm" role="alertdialog" aria-modal="true" aria-labelledby="lg-confirm-title" aria-describedby="lg-confirm-body">
            <h2 id="lg-confirm-title">Delete this entry?</h2>
            <p id="lg-confirm-body">
              "{confirming.title.trim() || 'Untitled'}" will be gone for good.{' '}
              {losing === 0
                ? "Nothing Summit learned comes only from it, so that stays."
                : losing === 1
                  ? 'This also removes 1 thing Summit learned only from it.'
                  : `This also removes ${losing} things Summit learned only from it.`}
            </p>
            <div className="lg-confirm-actions">
              <button type="button" className="lg-btn is-quiet" onClick={() => setConfirming(null)} autoFocus>
                Cancel
              </button>
              <button type="button" className="lg-btn is-danger-solid" onClick={confirmDelete}>
                Delete entry
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!embedded) {
    return (
      <div className="lg-page page-shell">
        {main}
        {side}
        {over}
      </div>
    );
  }
  return (
    <div className="lg-block" ref={rootRef} data-own-keys="">
      <div className={`lg-block-grid${show.entries ? ' has-side' : ''}`}>
        {main}
        {show.entries && side}
      </div>
      {(panel || confirming) && createPortal(over, document.body)}
    </div>
  );
}
