/**
 * The five subjects somebody is working on at the moment.
 *
 * ## Why five, and why chosen rather than derived
 *
 * The rail under them offers all hundred subjects, which is the right number to
 * be able to reach and the wrong number to be shown first. Five is what fits
 * across the top as something to read rather than scan, and it is enough to
 * hold a term of work: two subjects being studied, one being practised, one for
 * the job and one for the house.
 *
 * They start derived and become chosen. Until somebody picks, the five are the
 * subjects this account has actually filed the most tasks under — which is the
 * best available guess and is right often enough that most readers will never
 * open the picker. The moment one is changed, the whole set is stored: a
 * half-chosen set that kept re-deriving the other four would move under the
 * reader every time they finished a task.
 *
 * ## Where it is kept, and why not the database
 *
 * The browser, under an account-scoped key, exactly as utils/skillProgress
 * keeps practice. There is no table for it, and inventing one would be
 * inventing the schema for a preference whose shape is a week old. This module
 * is the only thing that touches the storage, so the day it becomes a column
 * the change is here and nowhere else.
 *
 * What is stored is subject ids — the catalogue's own ids, the same strings a
 * task carries — and never the tree they resolve to. The routing in
 * skills/subjectMap is free to change; a stored `mandarin` still means Mandarin
 * afterwards, where a stored `foreign-language` would have silently become an
 * answer to a question nobody asked.
 *
 * ## The one of the four that does not prune
 *
 * The reading and writing is utils/skillStore, the same as the other three.
 * What this store does not take is an `onRevision` pass: it holds *subject*
 * ids, and the trees moving underneath it changes nothing about whether
 * Mandarin is a subject. The catalogue is the server's, arrives per render, and
 * an id no longer in it resolves to nothing and is dropped where it is read —
 * see `resolveFocus` below and components/SkillTree/FocusTopics. Pruning
 * against a list that has not loaded yet would empty somebody's band on a slow
 * connection.
 */
import { skillStore } from './skillStore';

/** How many the band across the top holds. */
export const FOCUS_COUNT = 5;

/**
 * Null means "this account has never chosen", which is a different state from
 * "chose and then cleared" and is the gate components/SkillTree/FocusSetup
 * opens on. So `empty` is null and an empty stored array reads as null too —
 * clearing the answer is how the band's "Choose again" reopens the screen.
 */
const focusStore = skillStore<string[] | null>({
  key: 'skillFocusTopics',
  version: 1,
  empty: null,
  // The pre-envelope document was the bare array. See utils/skillStore.
  migrate: (from, raw) => (from === 0 ? raw : undefined),
  validate: (raw) => {
    if (!Array.isArray(raw)) return null;
    // Anything that is not a string is dropped rather than trusted: this is a
    // store a person can edit by hand, and one bad value should cost one slot.
    const clean = raw.filter((value): value is string => typeof value === 'string');
    return clean.length > 0 ? clean.slice(0, FOCUS_COUNT) : null;
  },
});

/** The stored ids, or null where this account has never chosen. */
export function loadFocus(username: string | null): string[] | null {
  return focusStore.load(username);
}

export function saveFocus(username: string | null, ids: string[]): void {
  focusStore.save(username, ids.slice(0, FOCUS_COUNT));
}

/**
 * The five to show: what was chosen, topped up from what is used most.
 *
 * `candidates` arrives in the order the catalogue endpoint sent it, which is
 * this account's own usage — so the top-up is "the subjects you work on",
 * without this module knowing that is what the order means. Duplicates are
 * dropped and the result is always exactly five where there are five to have,
 * because a band that sometimes holds four is a band with a hole in it.
 */
export function resolveFocus(chosen: string[] | null, candidates: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...(chosen ?? []), ...candidates]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === FOCUS_COUNT) break;
  }
  return out;
}
