/**
 * One Personal space: a name the reader can change and a page to write on.
 *
 * Reached from the rail's Personal section (`/spaces/1` to `/spaces/3`). The
 * name is the page's heading and is edited in place — click it, type, and it
 * is saved on Enter or when the field loses focus. The text saves itself a
 * moment after typing stops, and once more on the way out, so nothing typed is
 * lost to a navigation. Backend: backend/api/spaces.py.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useDocumentTitle, useSpaces } from '@/hooks';
import { SPACE_COUNT, defaultName, save } from '@/services/spaces';
import '@/styles/spaces.css';

/** How long typing has to stop before the text is saved. */
export const SAVE_AFTER_MS = 700;

type Status = 'idle' | 'saving' | 'saved' | 'failed';

const STATUS_WORDS: Record<Status, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Could not save. It will try again as you type.',
};

export default function Space() {
  const { spaceId = '' } = useParams();
  const id = Number(spaceId);
  const valid = Number.isInteger(id) && id >= 1 && id <= SPACE_COUNT;
  const { spaces, ready } = useSpaces(valid);
  const space = spaces.find((row) => row.id === id);

  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useDocumentTitle(space?.name ?? defaultName(id));

  /* Seeded once the account's copy lands, and again when the reader moves to
     another space. Not on every change to `spaces`: a rename this page saved
     comes back through it, and re-seeding would move the caret. */
  const [seeded, setSeeded] = useState<number | null>(null);
  useEffect(() => {
    if (!ready || !space || seeded === id) return;
    setName(space.name);
    setBody(space.body);
    setStatus('idle');
    setSeeded(id);
  }, [id, ready, seeded, space]);
  /* Editable only once filled in: a field enabled a render early could be
     blurred empty and save the default name over the reader's. */
  const loaded = seeded === id;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const text = pending.current;
    if (text === null) return;
    pending.current = null;
    setStatus('saving');
    const result = await save(id, { body: text }).catch(() => ({ success: false as const }));
    setStatus(result.success ? 'saved' : 'failed');
  }, [id]);

  // Whatever is unsaved goes on the way out, to this space and not the next.
  useEffect(() => () => void flush(), [flush]);

  const write = (text: string) => {
    setBody(text);
    pending.current = text;
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

  if (!valid) return <Navigate to="/spaces/1" replace />;

  return (
    <main className="sp-page">
      <div className="sp-shell">
        <header className="sp-head">
          <p className="sp-eyebrow">Personal</p>
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
          <p className="sp-status" role="status" aria-live="polite">
            {STATUS_WORDS[status]}
          </p>
        </header>

        <textarea
          className="sp-body"
          aria-label={`What is in ${name || defaultName(id)}`}
          placeholder="Write anything here: plans, lists, ideas. It saves as you type."
          value={body}
          disabled={!loaded}
          onChange={(event) => write(event.target.value)}
          onBlur={() => void flush()}
        />
      </div>
    </main>
  );
}
