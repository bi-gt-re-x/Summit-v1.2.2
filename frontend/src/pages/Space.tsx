/**
 * One space: a name the reader can change and a page to write on, in the
 * manner of Notion.
 *
 * Reached from the rail's Personal section (`/spaces/1` to `/spaces/3`) and its
 * Team section (`/team/1` to `/team/3`). A team space has one thing more, a
 * member list with an invite box — a placeholder that keeps the addresses as
 * pending and sends nothing (components/Spaces/Members).
 *
 * The page fills the window: a cover across the top if it wears one
 * (components/Spaces/Dress), then one row with its icon, its name (edited in
 * place — click it, type, and it is saved on Enter or when the field loses
 * focus), which kind of space it is, whether it has saved, and "Add icon" /
 * "Add cover"; then the blocks, written straight on the page with no box
 * around them. Below it the page is blocks
 * (components/Spaces/BlockEditor): headings, lists, to-dos, toggles, quotes,
 * callouts, dividers, code and charts (bar, line, area, pie, donut, set by
 * dragging), with a "/" menu and typing shortcuts. Every block can be dragged
 * by its handle anywhere on a 12-column grid and snaps to it
 * (components/Spaces/canvas). Live blocks and panel blocks put the account's
 * own numbers on the page: a panel is one of Analytics', the Timer's or
 * Achievements' own panels, and components/Spaces/SpaceData reads what they
 * need once for the whole page. The page saves itself a moment after editing stops,
 * and once more on the way out, so nothing is lost to a navigation. Backend:
 * backend/api/spaces.py.
 *
 * Down the right is the AI chat (components/Spaces/SpaceChat): ask it for a
 * page, or a change to this one, and it builds it. It folds to a tab.
 *
 * Beside the name are the page's tools (components/Spaces/PageTools): undo and
 * redo (⌘Z, ⇧⌘Z), earlier versions kept by the server, templates (a blank page
 * offers them up front), and export to Markdown or print.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useDocumentTitle, useSpaces } from '@/hooks';
import { Members } from '@/components/Spaces/Members';
import { SpaceChat } from '@/components/Spaces/SpaceChat';
import { BlockEditor } from '@/components/Spaces/BlockEditor';
import { SpaceData } from '@/components/Spaces/SpaceData';
import { Cover, DressTools, PageIcon } from '@/components/Spaces/Dress';
import { PageTools, TemplateStrip } from '@/components/Spaces/PageTools';
import { applyTemplate, isBlank, type Template } from '@/components/Spaces/templates';
import { downloadMarkdown } from '@/components/Spaces/exportDoc';
import { normalise, wordCount, type SpaceDoc } from '@/components/Spaces/blocks';
import { fillProps, isDark } from '@/components/Spaces/fill';
import {
  SPACE_PATH,
  defaultName as nameFor,
  move as moveSpace,
  remove as removeSpace,
  restore as restoreVersion,
  save as saveSpace,
  type SpaceKind,
} from '@/services/spaces';
import '@/styles/spaces.css';

/** How long editing has to stop before the page is saved. */
export const SAVE_AFTER_MS = 700;

/**
 * Typing within this long of the last change is the same step for undo, so ⌘Z takes
 * back a word or a burst of typing rather than one letter.
 */
export const UNDO_GROUP_MS = 900;
/** How many steps undo remembers. */
export const UNDO_KEEP = 100;

type Status = 'idle' | 'saving' | 'saved' | 'failed';

const STATUS_WORDS: Record<Status, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  failed: "Couldn't save. We'll keep trying as you type.",
};

export interface SpaceProps {
  kind?: SpaceKind;
}

export default function Space({ kind = 'personal' }: SpaceProps) {
  const { spaceId = '' } = useParams();
  const id = Number(spaceId);
  const valid = Number.isInteger(id) && id >= 1;
  const { spaces, folders, ready, reload } = useSpaces(valid, kind);
  const navigate = useNavigate();
  /* A page the list doesn't have may be one just made from the rail, before
     this page's copy of the list caught up: read it again once before
     deciding it isn't there. */
  const [askedFor, setAskedFor] = useState<number | null>(null);
  const missing = ready && valid && !spaces.some((row) => row.id === id);
  useEffect(() => {
    if (missing && askedFor !== id) {
      setAskedFor(id);
      reload();
    }
  }, [askedFor, id, missing, reload]);
  const space = spaces.find((row) => row.id === id);
  const defaultName = (at: number) => nameFor(at, kind);
  const save = (at: number, changes: { name?: string; doc?: SpaceDoc }) =>
    saveSpace(at, changes, kind);
  /** Which space the fields hold: the number alone is shared by both kinds. */
  const here = `${kind}:${id}`;

  const [name, setName] = useState('');
  const [doc, setDoc] = useState<SpaceDoc>(() => normalise(null));
  const [status, setStatus] = useState<Status>('idle');
  const pending = useRef<SpaceDoc | null>(null);
  const timer = useRef<number | undefined>(undefined);

  /* Undo and redo: whole pages, newest last. `current` mirrors `doc` so the
     keyboard handler always sees the page as it is. */
  const current = useRef<SpaceDoc>(doc);
  current.current = doc;
  const past = useRef<SpaceDoc[]>([]);
  const future = useRef<SpaceDoc[]>([]);
  const lastStep = useRef(0);
  const [, setSteps] = useState(0);
  const bump = () => setSteps((n) => n + 1);

  useDocumentTitle(space?.name ?? defaultName(id));

  /* Seeded once the account's copy lands, and again when the reader moves to
     another space. Not on every change to `spaces`: a save this page made
     comes back through it, and re-seeding would move the caret. */
  const [seeded, setSeeded] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !space || seeded === here) return;
    setName(space.name);
    setDoc(normalise(space.doc, space.body));
    setStatus('idle');
    setSeeded(here);
    past.current = [];
    future.current = [];
    bump();
  }, [here, ready, seeded, space]);
  /* Editable only once filled in: a field enabled a render early could be
     blurred empty and save the default name over the reader's. */
  const loaded = seeded === here;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    if (next === null) return;
    pending.current = null;
    setStatus('saving');
    const result = await saveSpace(id, { doc: next }, kind).catch(() => ({ success: false as const }));
    setStatus(result.success ? 'saved' : 'failed');
  }, [id, kind]);

  // Whatever is unsaved goes on the way out, to this space and not the next.
  useEffect(() => () => void flush(), [flush]);

  /** Show a page and save it soon, without touching undo. */
  const put = (next: SpaceDoc) => {
    setDoc(next);
    pending.current = next;
    setStatus('idle');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_AFTER_MS);
  };

  /** Remember the page as it is, as one step undo can go back to. */
  const remember = (force = false) => {
    const now = Date.now();
    const before = current.current;
    if (force || now - lastStep.current > UNDO_GROUP_MS) {
      past.current = [...past.current, before].slice(-UNDO_KEEP);
      future.current = [];
      bump();
    }
    lastStep.current = now;
  };

  const write = (next: SpaceDoc) => {
    // A block added or taken out is always a step of its own.
    remember(next.blocks.length !== current.current.blocks.length);
    put(next);
  };

  const undo = useCallback(() => {
    const back = past.current[past.current.length - 1];
    if (!back) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, current.current];
    lastStep.current = 0;
    bump();
    put(back);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redo = useCallback(() => {
    const ahead = future.current[future.current.length - 1];
    if (!ahead) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, current.current];
    lastStep.current = 0;
    bump();
    put(ahead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ⌘Z and ⇧⌘Z (Ctrl on other systems) anywhere on the page but the chat and the
     name. Caught before the browser's own undo, which only knows one field and
     would leave the page and its saved copy disagreeing. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const target = event.target as HTMLElement | null;
      // A block with its own editor (the Log) keeps its own ⌘Z.
      if (target?.closest('.sp-chat, .sp-name, .sp-pop, [data-own-keys]')) return;
      if (!target?.closest('.sp-page') && target !== document.body) return;
      event.preventDefault();
      if (key === 'y' || event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [redo, undo]);

  /* The AI chat's page (a build or an Undo) lands already saved on the
     server, so any autosave still waiting would only write the older page
     back over it. */
  const fromChat = (next: SpaceDoc) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    remember(true);
    setDoc(normalise(next));
    setStatus('saved');
  };

  /** Put a saved version back: what's unsaved is saved first, so it's in the history too. */
  const restoreAt = async (at: number): Promise<string> => {
    await flush();
    const result = await restoreVersion(id, at, kind).catch(() => ({ success: false as const, message: '' }));
    if (!result.success) return result.message || "Couldn't restore that version.";
    fromChat(result.space.doc ?? normalise(null));
    return '';
  };

  const pickTemplate = (template: Template) => write(applyTemplate(doc, template));
  const [chatOpen, setChatOpen] = useState(false);

  const rename = async () => {
    const next = name.trim() || defaultName(id);
    setName(next);
    if (next === space?.name) return;
    setStatus('saving');
    const result = await save(id, { name: next }).catch(() => ({ success: false as const }));
    setStatus(result.success ? 'saved' : 'failed');
  };

  if (!valid) return <Navigate to={`${SPACE_PATH[kind]}/1`} replace />;
  // A page that was deleted, or never made: the first one there is.
  if (missing && askedFor === id && spaces.length) return <Navigate to={`${SPACE_PATH[kind]}/${spaces[0]!.id}`} replace />;

  const fileUnder = async (folder: string) => {
    const result = await moveSpace(kind, id, folder).catch(() => ({ success: false as const, message: '' }));
    return result.success ? '' : result.message || "Couldn't move it.";
  };
  const deletePage = async () => {
    await flush();
    const result = await removeSpace(kind, id).catch(() => ({ success: false as const, message: '' }));
    if (!result.success) return result.message || "Couldn't delete it.";
    const next = spaces.find((row) => row.id !== id);
    navigate(next ? `${SPACE_PATH[kind]}/${next.id}` : '/dashboard', { replace: true });
    return '';
  };

  const words = wordCount(doc.blocks);
  /* The page's own background, and which way its words go to stay readable
     on it (styles/spaces.css, `.is-dark-bg` / `.is-light-bg`). */
  const painted = doc.background ? fillProps(doc.background) : null;
  const ground = doc.background ? (isDark(doc.background) ? ' has-bg is-dark-bg' : ' has-bg is-light-bg') : '';

  return (
    <main
      className={`sp-page${ground}${painted?.className ? ` ${painted.className}` : ''}${chatOpen ? ' has-chat' : ''}`}
      style={painted?.style}
    >
      {/* Edge to edge across the top, when the page wears one. */}
      <Cover doc={doc} disabled={!loaded} onDoc={(change) => write({ ...doc, ...change })} />

      <div className="sp-shell">
        {/* One row: the icon, the name, which kind of space, whether it has
            saved, and the two things a page can still be given. */}
        <header className="sp-head">
          <PageIcon icon={doc.icon} disabled={!loaded} onIcon={(icon) => write({ ...doc, icon })} />
          <input
            className="sp-name"
            aria-label="Space name"
            title="Click to rename"
            value={name}
            maxLength={40}
            placeholder={defaultName(id)}
            disabled={!loaded}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setName(space?.name ?? defaultName(id));
                // Blurring after the reset saves nothing: the name is unchanged.
                requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
              }
            }}
          />
          <span className="sp-eyebrow">{kind === 'team' ? 'Team' : 'Personal'}</span>
          <p className="sp-status" role="status" aria-live="polite">
            {STATUS_WORDS[status]}
          </p>
          <PageTools
            id={id}
            kind={kind}
            disabled={!loaded}
            canUndo={past.current.length > 0}
            canRedo={future.current.length > 0}
            onUndo={undo}
            onRedo={redo}
            onRestore={restoreAt}
            onTemplate={pickTemplate}
            onMarkdown={() => downloadMarkdown(doc, name || defaultName(id))}
            onPrint={() => window.print()}
            folders={folders}
            folder={space?.folder ?? ''}
            onMove={fileUnder}
            onDelete={deletePage}
            canDelete={spaces.length > 1}
          />
          <DressTools
            icon={doc.icon}
            cover={doc.cover}
            disabled={!loaded}
            onIcon={(icon) => write({ ...doc, icon })}
            onCover={(cover) => write({ ...doc, cover })}
            background={doc.background}
            onBackground={(background) => write({ ...doc, background })}
          />
        </header>

        {/* A blank page offers a start. Typing anything makes it go away. */}
        {loaded && isBlank(doc) && <TemplateStrip onPick={pickTemplate} />}

        {/* No box around the page: the blocks are written straight on it. */}
        <div className="sp-body">
          {/* What the page's panel blocks read, read once for all of them. */}
          <SpaceData blocks={doc.blocks}>
            <BlockEditor
              blocks={doc.blocks}
              disabled={!loaded}
              label={`What's in ${name || defaultName(id)}`}
              onChange={(blocks) => write({ ...doc, blocks })}
            />
          </SpaceData>
        </div>
        <p className="sp-foot">
          {words} {words === 1 ? 'word' : 'words'} · Type "/" for blocks · Drag ⋮⋮ to move · ⌘Z to undo
        </p>

        {kind === 'team' && loaded && space && (
          <Members spaceId={id} invites={space.invites ?? []} />
        )}
      </div>

      <SpaceChat kind={kind} id={id} doc={doc} disabled={!loaded} onDoc={fromChat} onOpenChange={setChatOpen} />
    </main>
  );
}
