/**
 * Three readings of one lattice: Map, Path, Progress.
 *
 * ## Why a mode switch rather than more layers on one canvas
 *
 * The canvas had acquired four ways of saying "this bit matters" — the focus
 * layer, the traced chain, the status lens and the you-are-here marker — and
 * every one of them is an adjustment to the same picture. The picture itself
 * was never in question: a hundred tiles in tier colours, whatever the reader
 * came to find out.
 *
 * But a subject lattice is answering three different questions depending on
 * who is looking and when, and they want genuinely different drawings:
 *
 *   **Map** — *what is this subject made of?* The authored lattice, tier
 *   coloured, nothing hidden. This is the curriculum, and it is the same on
 *   every account.
 *
 *   **Path** — *what am I actually walking?* The tenth of the tree that is
 *   behind, under and one step in front of the reader. Ninety tiles become
 *   twelve, and the twelve are the ones they would otherwise have had to pick
 *   out by eye. See `pathOf` in skills/route.
 *
 *   **Progress** — *how far round have I got?* The whole lattice again, but
 *   coloured by where the reader stands rather than by how hard a skill is.
 *   Mastered ground reads as one continuous shape, which is the thing a tier
 *   palette actively hides.
 *
 * Same data, three drawings. None of them is a filter over the others and none
 * of them changes a fact — which is why this is a switch and not another
 * toggle piled onto Map.
 *
 * ## The line under it
 *
 * Each mode says what it is showing in a sentence, with the count where there
 * is one worth printing. A segmented control whose three words are Map, Path
 * and Progress is three guesses; the line is what makes the second press
 * deliberate rather than exploratory.
 */
export type TreeMode = 'map' | 'path' | 'progress';

export const TREE_MODES: { id: TreeMode; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'path', label: 'Path' },
  { id: 'progress', label: 'Progress' },
];

export interface ModeSwitchProps {
  mode: TreeMode;
  onMode: (mode: TreeMode) => void;
  /** What the canvas is showing, in one line. Written by the page. */
  say: string;
}

export function ModeSwitch({ mode, onMode, say }: ModeSwitchProps) {
  return (
    <div className="stx-modes">
      {/* A radio group rather than three buttons: these are three states of
          one setting, and a screen reader should meet them as a choice with
          one answer instead of as three unrelated controls. */}
      <div className="stx-modes-set" role="radiogroup" aria-label="How to read this tree">
        {TREE_MODES.map((one) => (
          <button
            key={one.id}
            type="button"
            role="radio"
            aria-checked={mode === one.id}
            className={`stx-mode${mode === one.id ? ' is-on' : ''}`}
            onClick={() => onMode(one.id)}
          >
            {one.label}
          </button>
        ))}
      </div>
      <p className="stx-modes-say">{say}</p>
    </div>
  );
}
