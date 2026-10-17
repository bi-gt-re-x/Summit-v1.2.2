/**
 * Log: a private journal Summit learns from.
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
 * Saving never waits on the AI. The server reads the entry afterwards
 * (backend/tracking/journal.py), after a quiet spell for an autosave or
 * straight away on Save.
 */
import {
  Bold, ChevronRight, CircleCheck, Image, Italic, Link as LinkIcon, List, ListOrdered,
  NotebookPen, Plus, Search, Sparkles, Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RichEditor } from '@/components/Notes/RichEditor';
import { imageSelection, linkSelection, listSelection, markSelection } from '@/components/Notes/editing';
import { LearnedPanel } from '@/components/Log/LearnedPanel';
import {
  clearDraft, clock, entryDate, findEntries, onlyFrom, plainText, readDraft, writeDraft,
} from '@/components/Log/entry';
import { ErrorState, Loading } from '@/components/PageState';
import { useAuth } from '@/hooks';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { log as logService } from '@/services';
import type { Entry, Insight } from '@/services/log';
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
}

const BLANK: Draft = { id: '', title: '', body: '' };

type Status = 'empty' | 'unsaved' | 'saving' | 'saved' | 'failed';

/** The link or image box under the toolbar, with the selection it was opened on. */
interface Adding {
  kind: 'link' | 'image';
  range: Range | null;
  label: string;
}

const isBlank = (draft: Draft) => draft.title.trim() === '' && draft.body.trim() === '';

export default function Log() {
  useDocumentTitle('Log');
  const { username } = useAuth();
  const user = username ?? '';

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

  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [panel, setPanel] = useState(false);
  const [confirming, setConfirming] = useState<Entry | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [watch, setWatch] = useState(0);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLInputElement>(null);

  /* What's open and whether it's saved, for the moments that leave it. */
  const latest = useRef({ draft, status, user });
  latest.current = { draft, status, user };

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
      setWaiting(result.entries.filter((entry) => entry.learn_state === 'waiting').map((entry) => entry.id));
      setLoadError(null);
      return result.entries;
    } catch {
      setLoadError("Couldn't reach the server.");
      return null;
    }
  }, []);

  /* First load: put back a draft this device was holding, if there is one
     the server doesn't have. Otherwise the editor opens empty and ready. */
  useEffect(() => {
    if (!user) return;
    void load().then((rows) => {
      const kept = readDraft(user);
      if (!kept || (kept.title.trim() === '' && kept.body.trim() === '')) return;
      const server = kept.id ? rows?.find((entry) => entry.id === kept.id) : undefined;
      if (kept.id && !server) {
        // Deleted somewhere else; keep the words as a new entry.
        setDraft({ id: '', title: kept.title, body: kept.body });
      } else if (server && server.title === kept.title && server.body === kept.body) {
        clearDraft(user);
        return;
      } else {
        setDraft({ id: kept.id ?? '', title: kept.title, body: kept.body });
      }
      setEditorKey((key) => key + 1);
      setStatus('unsaved');
      setMessage("Put back what you were writing last time. It'll save in a moment.");
    });
  }, [load, user]);

  // The tab opens ready to type: the title has the caret once the page is in.
  const loaded = entries !== null;
  useEffect(() => {
    if (loaded) titleRef.current?.focus();
  }, [loaded]);

  // ---- Saving --------------------------------------------------------------
  const changeDraft = useCallback((next: Partial<Draft>) => {
    setDraft((was) => {
      const merged = { ...was, ...next };
      writeDraft(latest.current.user, { id: merged.id || undefined, title: merged.title, body: merged.body, at: Date.now() });
      return merged;
    });
    setStatus('unsaved');
  }, []);

  const keep = useCallback((entry: Entry) => {
    setEntries((rows) => [entry, ...(rows ?? []).filter((row) => row.id !== entry.id)]);
  }, []);

  const saving = useRef(false);

  const save = useCallback(async (final: boolean) => {
    const sent = latest.current.draft;
    if (isBlank(sent)) {
      if (final) setMessage('Write something first.');
      return;
    }
    if (saving.current) return;
    saving.current = true;
    setStatus('saving');
    try {
      const result = await logService.save({
        ...(sent.id ? { id: sent.id } : {}), title: sent.title, body: sent.body, final,
      });
      if (!result.success) {
        setStatus('failed');
        setMessage(`${result.message} Your writing is kept on this device.`);
        return;
      }
      const entry = result.entry;
      keep(entry);
      setSavedAt(Date.now());
      setMessage(null);
      const now = latest.current.draft;
      const same = now.title === sent.title && now.body === sent.body;
      setDraft((was) => ({ ...was, id: entry.id }));
      if (same) {
        setStatus('saved');
        clearDraft(latest.current.user);
      } else {
        // Typed on while it saved: the next autosave sends the rest.
        writeDraft(latest.current.user, { id: entry.id, title: now.title, body: now.body, at: Date.now() });
        setStatus('unsaved');
      }
      if (entry.learn_state === 'waiting') {
        setWaiting((ids) => (ids.includes(entry.id) ? ids : [...ids, entry.id]));
      }
      if (final) setWatch((beat) => beat + 1);
    } catch {
      setStatus('failed');
      setMessage("Couldn't reach the server. Your writing is kept on this device.");
    } finally {
      saving.current = false;
    }
  }, [keep]);

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
      void logService.save({
        ...(leaving.id ? { id: leaving.id } : {}), title: leaving.title, body: leaving.body,
      }).then((result) => {
        if (result.success) clearDraft(latest.current.user);
      }).catch(() => {});
    }
  }, []);

  /** Save what's open (if it needs it), then show `next` in the editor. */
  const switchTo = useCallback(async (next: Draft) => {
    const { status: was, draft: open } = latest.current;
    if ((was === 'unsaved' || was === 'failed') && !isBlank(open)) await save(false);
    if (latest.current.status === 'failed') return; // keep it open; the message says why
    setDraft(next);
    setEditorKey((key) => key + 1);
    setStatus(next.id ? 'saved' : 'empty');
    setSavedAt(null);
    setMessage(null);
    setAdding(null);
    clearDraft(latest.current.user);
  }, [save]);

  const openEntry = (entry: Entry) => void switchTo({ id: entry.id, title: entry.title, body: entry.body });
  const newEntry = () => void switchTo(BLANK).then(() => titleRef.current?.focus());

  // ---- Deleting ------------------------------------------------------------
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    if (!confirming) return;
    setDeleting(true);
    try {
      const result = await logService.remove(confirming.id);
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      const gone = confirming.id;
      setEntries((rows) => (rows ?? []).filter((row) => row.id !== gone));
      setInsights((rows) => rows
        .filter((row) => !(row.sources.length === 1 && row.sources[0] === gone))
        .map((row) => ({ ...row, sources: row.sources.filter((id) => id !== gone) })));
      setWaiting((ids) => ids.filter((id) => id !== gone));
      if (latest.current.draft.id === gone) {
        setDraft(BLANK);
        setEditorKey((key) => key + 1);
        setStatus('empty');
        setSavedAt(null);
        clearDraft(latest.current.user);
      }
    } catch {
      setMessage("Couldn't reach the server. Nothing was deleted.");
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
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

  // Cmd/Ctrl+S saves for real.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // ---- Drawing -------------------------------------------------------------
  const shown = useMemo(() => findEntries(entries ?? [], query, order), [entries, order, query]);
  const losing = confirming ? onlyFrom(insights, confirming.id).length : 0;
  const learnedCount = insights.filter((insight) => insight.status === 'active').length;

  if (loadError && !entries) {
    return <ErrorState message={loadError} onRetry={() => void load()} />;
  }
  if (!entries) return <Loading label="Loading your log" />;

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

  return (
    <div className="lg-page page-shell">
      <div className="lg-main">
        <header className="lg-head">
          <span className="lg-mark" aria-hidden="true"><NotebookPen /></span>
          <div className="lg-head-text">
            <h1>Log</h1>
            <p>
              Write about your day, what you're working toward, or anything on your mind. Only you can
              see it. Summit reads it to make your plans and suggestions fit you better.
            </p>
          </div>
          <button type="button" className="lg-btn" onClick={newEntry}>
            <Plus aria-hidden="true" /> New entry
          </button>
        </header>

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
        </section>

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
      </div>

      <div className="lg-side">
        <div className="lg-find">
          <label className="lg-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Search entries"
              aria-label="Search entries"
              onChange={(event) => setQuery(event.target.value)}
            />
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

        {shown.length === 0 ? (
          <p className="lg-empty">
            {entries.length === 0
              ? 'No entries yet. Save your first one and it shows up here.'
              : 'No entries match that.'}
          </p>
        ) : (
          <ul className="lg-list" aria-label="Your entries">
            {shown.map((entry) => {
              const preview = plainText(entry.body);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`lg-item${entry.id === draft.id ? ' is-on' : ''}`}
                    aria-current={entry.id === draft.id ? 'true' : undefined}
                    onClick={() => openEntry(entry)}
                  >
                    <span className="lg-item-top">
                      <strong>{entry.title.trim() || 'Untitled'}</strong>
                      <time dateTime={entry.created_at}>{entryDate(entry.created_at)}</time>
                    </span>
                    <span className="lg-item-preview">{preview || 'Nothing written yet.'}</span>
                    <ChevronRight className="lg-chev" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
              <button type="button" className="lg-btn is-danger-solid" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? 'Deleting…' : 'Delete entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
