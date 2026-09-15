/**
 * The card that appears under a tile while the pointer rests on it.
 *
 * ## Why a tile needs one at all
 *
 * A lattice tile is 64px and carries three facts: a drawing, a name, and
 * either a percentage or a gate fraction. Everything else about the skill —
 * what it waits on, how much of that is done, what it opens — was only
 * readable by clicking it, and clicking is how a reader ends up opening nine
 * panels to find the one node they meant. A hover card is the cheap half of
 * that: it answers *is this the one*, and the panel still answers *what do I
 * do about it*.
 *
 * So the card deliberately stops short of the panel. No blurb, no programme,
 * no action — two lines and a list of prerequisites. A tooltip that repeats
 * the panel is a panel that opens by accident.
 *
 * ## Fixed to the window, not to the canvas
 *
 * The obvious build puts the card inside the tile and lets CSS place it. That
 * breaks twice on this page: the tiles live inside a `transform: scale()`
 * layer, so the card's text would shrink with the drawing and be unreadable at
 * the 55% a large tree opens at, and the scroll box would clip it at every
 * edge. So the tile reports its rectangle in *viewport* coordinates and this
 * is positioned against the window, outside both problems.
 *
 * Under the tile by default rather than over it: over is where the "you are
 * here" flag lives, and two things in one place is one of them hidden. It
 * flips above only when there is no room below.
 *
 * ## It appears late and never blocks
 *
 * The fade carries an animation-delay — see `.stx-peek` in
 * styles/skilltree.css — so sweeping the pointer across a row of twelve tiles
 * shows nothing at all, and the card only resolves where somebody actually
 * stopped. And `pointer-events: none`, because a tooltip you can catch the
 * cursor on is a tooltip that eats the click it was explaining.
 */
import type { FocusRead } from '@/skills/route';
import { DIFFICULTY_LABEL, STATUS_LABEL } from '@/utils/skillGraph';

/** Where the tile is, in viewport pixels — a `DOMRect`, or anything shaped so. */
export interface PeekRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface TilePeekProps {
  /** Everything about the hovered node, from `focusOn` in skills/route. */
  read: FocusRead;
  /** The tile's rectangle, reported by the tile itself on pointer enter. */
  rect: PeekRect;
  /** A navigation diamond, which is a doorway rather than a skill. */
  nav?: boolean;
}

/** How wide the card is. Also the number the clamp below works from. */
const WIDTH = 236;
/** The gap between the tile and the card, and the margin off the window edge. */
const GAP = 10;
/** Roughly how tall a full card runs. Only used to decide which side it goes. */
const TALL = 180;
/** Past this many prerequisites the list becomes a paragraph. */
const NAMES = 4;

export function TilePeek({ read, rect, nav = false }: TilePeekProps) {
  const { here, requires, met, unlocks } = read;

  /* Room is measured against the card's own height, which is not known until
     it is drawn — so this uses a generous fixed estimate instead. Being wrong
     by a line puts the card slightly high; measuring properly would cost a
     layout pass on every hover to fix something nobody can see. */
  const below = rect.bottom + GAP;
  const room = window.innerHeight - below > TALL;
  const left = Math.max(
    GAP,
    Math.min(window.innerWidth - WIDTH - GAP, rect.left + rect.width / 2 - WIDTH / 2),
  );

  const style = room
    ? { top: below, left, width: WIDTH }
    : { top: Math.max(GAP, rect.top - GAP - TALL), left, width: WIDTH };

  const shown = requires.slice(0, NAMES);
  const more = requires.length - shown.length;

  return (
    /* Hidden from the accessibility tree on purpose. Every fact on it is
       already in the tile's `aria-label` or one keypress away in the panel,
       and a live region that fires on every pointer movement across forty
       tiles is worse than no region at all. */
    <div className="stx-peek" style={style} aria-hidden="true">
      <strong className="stx-peek-name">{here.name}</strong>

      <p className="stx-peek-line">
        <span className="stx-peek-tier">{DIFFICULTY_LABEL[here.difficulty]}</span>
        {!nav && (
          <>
            <i>·</i>
            <span>{STATUS_LABEL[here.status]}</span>
            {/* A locked node's percentage is always nought, which is a true
                figure answering no question — the same argument the gate
                fraction on the tile itself is made from. */}
            {here.status !== 'locked' && (
              <>
                <i>·</i>
                <span>{Math.round(here.percent)}%</span>
              </>
            )}
          </>
        )}
      </p>

      {nav ? (
        <p className="stx-peek-nav">Opens a lattice of its own.</p>
      ) : (
        <>
          {requires.length > 0 && (
            <>
              <p className="stx-peek-head">
                {met} of {requires.length}{' '}
                {requires.length === 1 ? 'prerequisite' : 'prerequisites'} done
              </p>
              <ul className="stx-peek-needs">
                {shown.map((need) => {
                  const done = need.status === 'complete';
                  return (
                    <li key={need.id} className={done ? 'is-done' : undefined}>
                      <i>{done ? '✓' : '○'}</i>
                      {need.name}
                    </li>
                  );
                })}
                {more > 0 && <li className="is-more">and {more} more</li>}
              </ul>
            </>
          )}

          {unlocks.length > 0 && (
            <p className="stx-peek-opens">
              Unlocks {unlocks.length} {unlocks.length === 1 ? 'skill' : 'skills'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
