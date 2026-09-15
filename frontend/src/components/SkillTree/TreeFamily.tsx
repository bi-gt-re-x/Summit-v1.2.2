/**
 * Where this lattice sits among the others, drawn rather than listed.
 *
 * ## What was wrong with the list
 *
 * The three ways out of a tree — the one above it, the ones below it, the ones
 * beside it — were three labelled rows of pills: *Up*, *Branches into*,
 * *Beside*. Every fact was there and the shape was not. "Beside" is only
 * meaningful once you know what they are beside *each other under*, and a
 * reader who had walked three forks into Coding had to reconstruct the
 * hierarchy from three prepositions.
 *
 * So the same three facts are drawn in the shape they describe: the parent
 * above, the peers on one row with this one lit among them, the children
 * below, and a line joining the rows. It is the smallest possible family tree
 * and it answers "where am I" without a preposition.
 *
 * ## The peers row holds this tree too
 *
 * `siblingsOf` leaves the open tree out, which is right for a list and wrong
 * for a row: a row of three with the fourth missing is a row that has hidden
 * the only one you needed to find. So the page hands in every child of the
 * parent, in authored order, and this lights the one you are in.
 *
 * ## It draws nothing where there is nothing to draw
 *
 * A root subject with no children has no family, and three empty rows under a
 * heading is a control explaining that there is no control.
 */
import type { SubjectTree } from '@/skills/subjectTrees';

export interface TreeFamilyProps {
  /** The tree that is open. */
  here: SubjectTree;
  /** The one above it, where there is one. */
  up: SubjectTree | null;
  /**
   * Every tree on this rung, the open one included and in authored order —
   * `childrenOf(parent)`, or just the open tree at a root.
   */
  peers: readonly SubjectTree[];
  /** The trees this one branches into. */
  into: readonly SubjectTree[];
  onGo: (id: string) => void;
}

export function TreeFamily({ here, up, peers, into, onGo }: TreeFamilyProps) {
  const others = peers.filter((one) => one.id !== here.id);
  if (!up && into.length === 0 && others.length === 0) return null;

  return (
    <nav className="stx-family" aria-label="Where this lattice sits">
      {up && (
        <div className="stx-family-rung is-up">
          <button type="button" className="stx-family-chip" onClick={() => onGo(up.id)}>
            {up.title}
          </button>
          <i className="stx-family-line" aria-hidden="true" />
        </div>
      )}

      <div className="stx-family-rung is-peers">
        {peers.map((one) => {
          const open = one.id === here.id;
          return open ? (
            <span key={one.id} className="stx-family-chip is-here" aria-current="page">
              {one.title}
            </span>
          ) : (
            <button
              key={one.id}
              type="button"
              className="stx-family-chip"
              onClick={() => onGo(one.id)}
            >
              {one.title}
            </button>
          );
        })}
      </div>

      {into.length > 0 && (
        <div className="stx-family-rung is-into">
          <i className="stx-family-line" aria-hidden="true" />
          <div className="stx-family-kids">
            {into.map((child) => (
              <button
                key={child.id}
                type="button"
                className="stx-family-chip is-child"
                onClick={() => onGo(child.id)}
              >
                {child.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
