/**
 * The skill tree from the keyboard.
 *
 * The lattice is the most pointer-bound page in the app: everything on it is a
 * tile you click, a canvas you drag, or a control floating over one. The tiles
 * are real buttons, so Tab and Enter have always worked and the arrow keys walk
 * between them (see `onKeys` in components/SkillTree/SkillTree) — what was
 * missing was the handful of verbs that belong to the *page* rather than to
 * whatever happens to be focused.
 *
 * ## The four, and what each replaces
 *
 *     Esc   put the canvas back — clear the selection, the trace, the filter
 *     F     frame where you are standing
 *     R     fit the whole tree
 *     P     practise the selected skill
 *
 * Every one of them is a control already on the page, which is the rule this
 * set was chosen by: a shortcut for something with no button is a secret, and
 * a page of secrets is a page nobody can learn. The search has its own — `/`,
 * in components/SkillTree/SubjectRail, where the field it focuses lives.
 *
 * ## Space is deliberately not "practise"
 *
 * Space on a focused button means *press this button*, everywhere, in every
 * browser, and the lattice is ninety focusable buttons. Rebinding it would
 * make this the one page in the app where the key does something else, and it
 * would do it at exactly the moment a reader had a tile focused — which is
 * when they are most likely to be pressing Space to open it. `P` is free, and
 * reads as the verb.
 *
 * ## What it refuses to fire on
 *
 * Anything typed into a field, and anything with a modifier held — the same
 * two rules hooks/useCalendarKeys works to, sharing the same test from
 * utils/keys. The lattice has a search field, a rename field and a programme
 * editor on it, and a letter shortcut that cleared the selection while
 * somebody renamed a node would not be a shortcut.
 */
import { useEffect } from 'react';
import { claimed, typing } from '@/utils/keys';

export interface LatticeKeys {
  /** Escape: clear everything the reader has narrowed the canvas to. */
  onClear: () => void;
  /** F: frame the node the marker is on. */
  onHere: () => void;
  /** R: fit the whole tree. */
  onFit: () => void;
  /** P: practise the selected skill. Absent while nothing is selected. */
  onPractise?: () => void;
  /** False while a dialog or an editor owns the keyboard. */
  enabled?: boolean;
}

export function useLatticeKeys({
  onClear,
  onHere,
  onFit,
  onPractise,
  enabled = true,
}: LatticeKeys): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (claimed(event) || typing(event.target)) return;

      /* Escape is the one that fires while the reader is typing too — it is
         how you get out of a field — so it is handled by whatever owns that
         field, and this only sees the ones that reach the page. */
      const key = event.key === 'Escape' ? 'escape' : event.key.toLowerCase();

      if (key === 'escape') onClear();
      else if (key === 'f') onHere();
      else if (key === 'r') onFit();
      else if (key === 'p' && onPractise) onPractise();
      else return;

      event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onClear, onFit, onHere, onPractise]);
}
