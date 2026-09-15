/**
 * The one door the skill tree's four browser stores go through.
 *
 * ## What this replaces
 *
 * Four modules, each with its own `loadX`/`saveX` pair, each opening with the
 * same eleven lines: scope the key, read, `JSON.parse`, check it is an object,
 * validate the entries, and swallow every error because a tree that opens at
 * its designed position is a better failure than one that does not open. Four
 * copies of a thing that has to behave identically is three chances for it not
 * to, and the day these move to an endpoint it is four migrations rather than
 * one.
 *
 * Everything above a store still calls `loadProgress` and `saveProgress`. The
 * signatures did not change; what changed is that there is now one
 * implementation under them, and it is the implementation an API repository
 * would replace.
 *
 * ## The envelope, and why it had to exist before anything else was built
 *
 * The stores used to hold the naked value — `{"c.vars": 250}` — which is fine
 * exactly until the shape changes. The moment `SkillProgress` becomes anything
 * but `Record<string, number>`, every existing browser is holding a document
 * the new validator rejects entry by entry, and the failure is **silent**: the
 * reader opens the page, sees their practice gone, and there is nothing to
 * read that says why.
 *
 * So a stored document is
 *
 *     { "v": 1, "rev": "a3f10c2", "data": { … } }
 *
 * `v` is the shape, and a store that has moved forward brings old documents
 * with it through `migrate`. `rev` is the *content* of the authored trees, and
 * it is the other half of the problem: the trees are edited, node ids are
 * retired, and a retired id reused for a different skill next year would land
 * somebody's XP on a node they have never touched. When `rev` moves, the store
 * gets one pass at what it holds — `onRevision` — which is where the three
 * node-keyed stores drop ids no tree names any more.
 *
 * A document with neither field is version 0 and is exactly what the four
 * stores wrote before today. That is the first migration and the reason the
 * bare shape is handled rather than discarded: a reader's practice is not a
 * cache.
 *
 * ## It still never throws
 *
 * Every entry point is wrapped, for the reasons the old modules each wrote out
 * separately: private-mode storage, a quota error, JSON that belongs to
 * something else, or a person who edited the file by hand. A store that cannot
 * be read opens empty and a store that cannot be written keeps working for the
 * session — the state above it is the source of truth while the tab is open.
 */
import { userScopedKey } from './calendarStore';

/** What a stored document looks like from version 1 on. */
interface Envelope {
  v: number;
  /** The content fingerprint of the authored trees when this was written. */
  rev: string;
  data: unknown;
}

export interface StoreSpec<T> {
  /**
   * The unscoped key, which may never change: it is scoped per account by
   * `userScopedKey` in utils/calendarStore, and that key shape is load-bearing
   * — change it and every existing store reads as empty.
   */
  key: string;
  /** The shape version. Bump it whenever `T` changes, and add a `migrate` arm. */
  version: number;
  /** What a reader with nothing stored has. */
  empty: T;
  /**
   * Whatever came back, turned into a `T`.
   *
   * Drops what it does not recognise rather than throwing: one bad entry
   * should cost one node, not every node. Runs last, after any migration, so a
   * migration only has to produce the current shape rather than a valid one.
   */
  validate: (raw: unknown) => T;
  /**
   * An older document, brought forward to the current shape.
   *
   * Given the version it was written at — 0 for the bare pre-envelope value —
   * and whatever was under it. Return `undefined` for a document that cannot be
   * carried forward; the store then opens empty, which is the honest answer and
   * is still better than half a document.
   */
  migrate?: (from: number, raw: unknown) => unknown;
  /**
   * The authored trees changed since this was written. One pass at the value
   * before it is handed over — `keepKnownNodes` in skills/subjectTrees, for
   * the three stores keyed by node id.
   */
  onRevision?: (value: T) => T;
  /**
   * The current content fingerprint. A function rather than a constant so a
   * store can be declared before the trees are loaded, and so a test can pin
   * it. Absent means this store does not care what the trees say.
   */
  revision?: () => string;
}

export interface SkillStore<T> {
  load(username: string | null): T;
  save(username: string | null, value: T): void;
  /**
   * The shape and revision actually on disk, or null when nothing is.
   *
   * Not for the app, which has no business knowing a store has a version. It
   * is the diagnostic the *next* migration is written against: a reader of
   * this file six months from now needs to be able to ask what a browser is
   * holding without parsing the key by hand.
   */
  stampOf(username: string | null): { version: number; revision: string } | null;
}

export function skillStore<T>(spec: StoreSpec<T>): SkillStore<T> {
  const keyFor = (username: string | null) => userScopedKey(spec.key, username);
  const revNow = () => spec.revision?.() ?? '';

  function drop(username: string | null): void {
    try {
      localStorage.removeItem(keyFor(username));
    } catch {
      /* Nothing to do about it, and nothing depends on it. */
    }
  }

  function write(username: string | null, data: T): boolean {
    try {
      const envelope: Envelope = { v: spec.version, rev: revNow(), data };
      localStorage.setItem(keyFor(username), JSON.stringify(envelope));
      return true;
    } catch {
      // Storage being unavailable must not stop the click from having worked
      // on screen; the state above this is the session's source of truth.
      return false;
    }
  }

  return {
    load(username) {
      try {
        const raw = localStorage.getItem(keyFor(username));
        if (!raw) return spec.empty;

        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return spec.empty;

        /* Version 0 is the bare value the four stores wrote before the envelope
           existed. It is told apart by the absence of `v` rather than by the
           shape of what is under it, because two of the four stores hold a
           plain object and would otherwise be indistinguishable from an
           envelope with a missing field. */
        const enveloped = 'v' in parsed && typeof (parsed as Envelope).v === 'number';
        const from = enveloped ? (parsed as Envelope).v : 0;
        const body = enveloped ? (parsed as Envelope).data : parsed;
        const storedRev = enveloped ? String((parsed as Envelope).rev ?? '') : '';

        let carried: unknown = body;
        let stale = !enveloped || from !== spec.version;

        if (from !== spec.version) {
          carried = spec.migrate ? spec.migrate(from, body) : undefined;
          if (carried === undefined) {
            // Nothing to carry forward. Dropped rather than left in place, so
            // the next read is not the same failure.
            drop(username);
            return spec.empty;
          }
        }

        let value = spec.validate(carried);

        if (spec.onRevision && storedRev !== revNow()) {
          value = spec.onRevision(value);
          stale = true;
        }

        // Written back only when something actually moved, so an ordinary read
        // on an up-to-date store is a read.
        if (stale) write(username, value);
        return value;
      } catch {
        // Private-mode storage, a quota error, JSON that is not ours, or a
        // document somebody edited by hand. Opening at the designed position is
        // a far better failure than not opening.
        return spec.empty;
      }
    },

    save(username, value) {
      write(username, value);
    },

    stampOf(username) {
      try {
        const raw = localStorage.getItem(keyFor(username));
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !('v' in parsed)) {
          return { version: 0, revision: '' };
        }
        const envelope = parsed as Envelope;
        return { version: Number(envelope.v) || 0, revision: String(envelope.rev ?? '') };
      } catch {
        return null;
      }
    },
  };
}
