/**
 * The subject catalogue, fetched once per account.
 *
 * The list is a hundred fixed rows and the only thing about it that moves is
 * the ordering, which follows how often the account has used each subject —
 * so a fetch per opened dialog would be a hundred rows re-sent to answer a
 * question whose answer changes about once a day. It is cached module-wide
 * instead, keyed by account, and the in-flight promise is cached too so two
 * dialogs opening at once make one request rather than two.
 *
 * The key is still the account even though the request no longer names one —
 * the server reads that off the session now (backend/api/guard.py). It is a
 * *cache* key, and it has to stay: one browser can sign out and back in as
 * somebody else, and an unkeyed cache would hand the second account the
 * first's catalogue.
 *
 * The cache is deliberately not invalidated when a task is created. Creating
 * one task moves a subject up the order at most one place, and re-fetching a
 * hundred rows to reflect that in a dialog the reader has just closed is not
 * worth it; the next page load has it right.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { list as listSubjects, type Subject } from '@/services/subjects';
import { setSubjectFamilies, type Family } from '@/utils/eventPalette';

const cache = new Map<string, Subject[]>();
const inFlight = new Map<string, Promise<Subject[]>>();

/**
 * Fired when the catalogue changes — a subject added, deleted or recoloured.
 *
 * The cache is module-wide and a dozen components read it, so a change made in
 * the subject library has to reach the grid drawn beside it, the picker in an
 * open dialog, and the dashboard's task rows. A custom event rather than
 * shared state for the same reason the rail listens for one: it is a single
 * fact travelling one way, with no reply.
 */
export const SUBJECTS_CHANGED = 'summit:subjects-changed';

/**
 * Publish the account's colour choices where the drawing code can reach them.
 *
 * `familyForSubject` is called from pure functions with no account in scope —
 * see the note on `setSubjectFamilies` in utils/eventPalette. This is the one
 * place that knows both the account and its subjects, so this is where the two
 * are joined.
 */
function publishFamilies(list: Subject[]): void {
  setSubjectFamilies(
    list
      .filter((subject): subject is Subject & { family: Family } => Boolean(subject.family))
      .map((subject) => [subject.id, subject.family] as const),
  );
}

function load(username: string): Promise<Subject[]> {
  const cached = cache.get(username);
  if (cached) return Promise.resolve(cached);

  const running = inFlight.get(username);
  if (running) return running;

  const request = listSubjects()
    .then((result) => {
      const list = result.success ? result.subjects : [];
      // Only a real answer is cached. An empty list from a failed request
      // would otherwise be the answer for the rest of the session.
      if (result.success) {
        cache.set(username, list);
        publishFamilies(list);
      }
      return list;
    })
    .catch(() => [] as Subject[])
    .finally(() => {
      inFlight.delete(username);
    });

  inFlight.set(username, request);
  return request;
}

/**
 * Re-read the catalogue and tell everyone reading it.
 *
 * The cache is deliberately not invalidated when a *task* is created — see the
 * note at the top. Editing the catalogue itself is the opposite case: the
 * reader has just changed it on purpose and is looking at the thing they
 * changed.
 */
export async function refreshSubjects(username: string): Promise<void> {
  cache.delete(username);
  inFlight.delete(username);
  await load(username);
  window.dispatchEvent(new CustomEvent(SUBJECTS_CHANGED));
}

export function useSubjects(username: string | null): Subject[] {
  const [list, setList] = useState<Subject[]>(() =>
    username ? cache.get(username) ?? [] : [],
  );

  const read = useCallback(() => {
    if (!username) return undefined;
    let live = true;
    void load(username).then((result) => {
      if (live) setList(result);
    });
    return () => {
      live = false;
    };
  }, [username]);

  useEffect(() => {
    if (!username) {
      setList([]);
      // Nobody is signed in, so no account's colours are in force.
      setSubjectFamilies([]);
      return;
    }
    return read();
  }, [read, username]);

  // A change made anywhere — the library is the only place, today — reaches
  // every other reader of the catalogue without any of them knowing about it.
  useEffect(() => {
    const onChanged = () => read();
    window.addEventListener(SUBJECTS_CHANGED, onChanged);
    return () => window.removeEventListener(SUBJECTS_CHANGED, onChanged);
  }, [read]);

  return list;
}

/**
 * The same catalogue, keyed by the id a task stores.
 *
 * A task carries a subject *id* and nothing else — the name and the icon live
 * only in the catalogue — so anything that wants to draw a task's subject has
 * to look it up. Everywhere that does (the grid blocks, the dashboard's task
 * rows, the week's XP breakdown) wants the same map, so it is built once here
 * rather than three times from three copies of the same `.find`.
 *
 * An id the catalogue does not recognise resolves to nothing, which is the
 * same thing as a task with no subject: no icon, no pill, counted under Other.
 */
/**
 * The catalogue, keyed by id.
 *
 * Named because three call sites pass it around — the analytics model and two
 * of its tabs — and `Map<string, Subject>` spelled out at each of them says
 * less than the name does.
 */
/**
 * Whether the catalogue has answered for this account yet.
 *
 * `useSubjects` starts on an empty list and fills in, which is right for a
 * picker but wrong for a page that wants to draw once with everything in
 * place — an empty catalogue and one still on its way look the same. This
 * shares the same request (`load` dedupes), so asking costs nothing extra.
 */
export function useSubjectsReady(username: string | null): boolean {
  const [ready, setReady] = useState(() => !username || cache.has(username));
  useEffect(() => {
    if (!username) {
      setReady(true);
      return undefined;
    }
    if (cache.has(username)) {
      setReady(true);
      return undefined;
    }
    let live = true;
    setReady(false);
    void load(username).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [username]);
  return ready;
}

export type SubjectIndex = Map<string, Subject>;

export function useSubjectIndex(username: string | null): SubjectIndex {
  const subjects = useSubjects(username);
  return useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  );
}

/** The subject a task is filed under, or null. */
export function subjectOf(
  index: Map<string, Subject>,
  subjectId: string | undefined,
): Subject | null {
  return (subjectId && index.get(subjectId)) || null;
}
