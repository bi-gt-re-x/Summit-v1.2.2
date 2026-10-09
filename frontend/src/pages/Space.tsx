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
 * (components/Spaces/canvas). The page saves itself a moment after editing stops,
 * and once more on the way out, so nothing is lost to a navigation. Backend:
 * backend/api/spaces.py.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useDocumentTitle, useSpaces } from '@/hooks';
import { Members } from '@/components/Spaces/Members';
import { BlockEditor } from '@/components/Spaces/BlockEditor';
import { Cover, DressTools, PageIcon } from '@/components/Spaces/Dress';
import { normalise, wordCount, type SpaceDoc } from '@/components/Spaces/blocks';
import { fillProps, isDark } from '@/components/Spaces/fill';
import {
  SPACE_COUNT,
  SPACE_PATH,
  defaultName as nameFor,
  save as saveSpace,
  type SpaceKind,
} from '@/services/spaces';
import '@/styles/spaces.css';

/** How long editing has to stop before the page is saved. */
export const SAVE_AFTER_MS = 700;

type Status = 'idle' | 'saving' | 'saved' | 'failed';

const STATUS_WORDS: Record<Status, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Could not save. It will try again as you type.',
};

export interface SpaceProps {
  kind?: SpaceKind;
}

export default function Space({ kind = 'personal' }: SpaceProps) {
  const { spaceId = '' } = useParams();
  const id = Number(spaceId);
  const valid = Number.isInteger(id) && id >= 1 && id <= SPACE_COUNT;
  const { spaces, ready } = useSpaces(valid, kind);
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

  const write = (next: SpaceDoc) => {
    setDoc(next);
    pending.current = next;
    setStatus('idle');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_AFTER_MS);
  };

  const rename = async () => {
    const next = name.trim() || defaultName(id);
    setName(next);
    if (next === space?.name) return;
    setStatus('saving');
    const result = await save(id, { name: next }).catch(() => ({ success: false as const }));
    setStatus(result.success ? 'saved' : 'failed');
  };

  if (!valid) return <Navigate to={`${SPACE_PATH[kind]}/1`} replace />;

  const words = wordCount(doc.blocks);
  /* The page's own background, and which way its words go to stay readable
     on it (styles/spaces.css, `.is-dark-bg` / `.is-light-bg`). */
  const painted = doc.background ? fillProps(doc.background) : null;
  const ground = doc.background ? (isDark(doc.background) ? ' has-bg is-dark-bg' : ' has-bg is-light-bg') : '';

  return (
    <main className={`sp-page${ground}${painted?.className ? ` ${painted.className}` : ''}`} style={painted?.style}>
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

        {/* No box around the page: the blocks are written straight on it. */}
        <div className="sp-body">
          <BlockEditor
            blocks={doc.blocks}
            disabled={!loaded}
            label={`What is in ${name || defaultName(id)}`}
            onChange={(blocks) => write({ ...doc, blocks })}
          />
        </div>
        <p className="sp-foot">
          {words} {words === 1 ? 'word' : 'words'} · Type “/” for blocks · Drag ⋮⋮ to move
        </p>

        {kind === 'team' && loaded && space && (
          <Members spaceId={id} invites={space.invites ?? []} />
        )}
      </div>
    </main>
  );
}
