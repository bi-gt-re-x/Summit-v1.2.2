/**
 * One tile on a subject lattice.
 *
 * The compact counterpart to {@link SkillNode}: where that draws a labelled
 * card, this draws a rounded square holding the skill's icon, with the name
 * under it and the percentage under that. Three pieces of a fixed size, so a
 * lattice of ninety of them still reads as a shape rather than as a paragraph.
 *
 * The icon is painted as a **CSS mask** rather than loaded as an image — see
 * utils/icons/tree_icons/README.md. That is what lets one file be grey on a
 * locked tile and green on a mastered one without a second copy of the drawing:
 * the alpha is the shape, and the colour is whatever the tile has decided.
 *
 * A **navigation** tile is the one exception to "a node is a skill": it is a
 * diamond rather than a square, and clicking it walks into the child subject it
 * names rather than selecting anything. The page hands that behaviour in
 * through `onNavigate`; the tile only knows to draw itself differently.
 *
 * Placement, size and state come from the layout and the graph exactly as they
 * do for the card node — this component owns none of it.
 *
 * ## The focus layer
 *
 * `emphasis` is the third thing a tile can be told, after its status and its
 * tier, and it is about the *reader* rather than about the skill: here, near,
 * or dimmed out of the way. It arrives as one of three words rather than as a
 * set of booleans so a tile can never be both — see `emphasise` in
 * skills/route for why three and not five.
 *
 * `here` also draws the label. It is a real element rather than a `::after` so
 * a screen reader meets it: "you are here" is the single most useful thing on
 * the canvas and is exactly the sort of thing that ends up sighted-only.
 *
 * ## A locked tile prints its gate, not its nought
 *
 * Every other tile ends in a percentage. A locked one's is always zero, which
 * is a true figure answering no question — and it made "one prerequisite left"
 * and "four prerequisites left" render identically, when those are the two
 * states a reader feels most differently about. So a gated tile prints `2/3`
 * instead, and the fraction is what turns a wall of dead ends into a set of
 * near-term targets. See `gatesOf` in skills/route.
 *
 * ## What a tile says without being clicked
 *
 * Three facts fit on 64px and the rest used to need a click, so finding one
 * node among forty meant opening nine panels. The tile now reports its
 * rectangle when the pointer settles on it and the page draws a card from
 * that — see components/SkillTree/TilePeek, which owns everything about how
 * the card looks and where it lands. This component only says *when*.
 */
import type { CSSProperties } from 'react';
import type { Emphasis } from '@/skills/route';
import { iconUrl } from '@/skills/subjectTrees';
import { DIFFICULTY_LABEL, type GraphNode, type PlacedNode } from '@/utils/skillGraph';

export interface LatticeNodeProps {
  placed: PlacedNode;
  /** Node width/height, from the lattice geometry. */
  size: number;
  selected: boolean;
  onSelect: (node: GraphNode | null) => void;
  /** Present when the tile opens a child subject rather than a skill. */
  onNavigate?: () => void;
  /** Where this tile sits in the focus layer, or absent while there is none. */
  emphasis?: Emphasis;
  /** Draw the "you are here" marker, whether or not a focus layer is on. */
  here?: boolean;
  /** How far through its prerequisites, for the ones that have any. */
  gate?: { met: number; need: number };
  /** Light the whole prerequisite chain up to this node. */
  onTrace?: () => void;
  /**
   * The pointer has come to rest on this tile — draw the hover card for it.
   *
   * The tile hands over its own rectangle because it is the only thing that
   * knows it: the card is positioned against the *window* rather than against
   * the canvas, for the two reasons components/SkillTree/TilePeek gives. Read
   * at the moment of the event rather than held, so a tile that has been
   * scrolled or zoomed since reports where it is now.
   */
  onPeek?: (node: GraphNode, rect: DOMRect) => void;
  /** The pointer has left. Always paired with `onPeek`. */
  onPeekEnd?: () => void;
}

export function LatticeNode({
  placed,
  size,
  selected,
  onSelect,
  onNavigate,
  emphasis,
  here = false,
  gate,
  onTrace,
  onPeek,
  onPeekEnd,
}: LatticeNodeProps) {
  const { node, x, y } = placed;
  const nav = Boolean(onNavigate);

  const style = {
    left: x,
    top: y,
    width: size,
    height: size,
    // Read by the mask rule in the stylesheet. A custom property rather than an
    // inline background, so the stylesheet keeps deciding how it is painted.
    ['--ico' as string]: `url(${iconUrl(node.icon)})`,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`stx-tile is-${node.status} tier-${node.difficulty}${nav ? ' is-nav' : ''}${
        selected ? ' is-selected' : ''
      }${emphasis ? ` em-${emphasis}` : ''}${here ? ' is-here' : ''}`}
      style={style}
      aria-pressed={nav ? undefined : selected}
      aria-label={
        `${nav ? `Open ${node.name}` : node.name}`
        + (node.status === 'locked' && gate
          ? `. Locked, ${gate.met} of ${gate.need} prerequisites done`
          : '')
        + (here ? '. You are here' : '')
      }
      /* The name, and nothing else, because the hover card below says the
         rest and two tooltips on one tile is one too many. Kept rather than
         dropped: the native one is what a touch device and a dragged pointer
         still get. */
      title={nav ? `${node.name} →` : node.name}
      onClick={() => (nav ? onNavigate?.() : onSelect(node))}
      onDoubleClick={nav ? undefined : onTrace}
      /* Pointer rather than mouse events, so a stylus is a hover and a finger
         is not — a touch that raised a card would put one over the tile it
         was about to tap. Focus is here too: tabbing through a lattice should
         tell you the same things pointing at it does. */
      onPointerEnter={
        onPeek
          ? (event) => {
              if (event.pointerType === 'touch') return;
              onPeek(node, event.currentTarget.getBoundingClientRect());
            }
          : undefined
      }
      onPointerLeave={onPeekEnd}
      onFocus={onPeek ? (event) => onPeek(node, event.currentTarget.getBoundingClientRect()) : undefined}
      onBlur={onPeekEnd}
    >
      {here && <span className="stx-tile-here">You are here</span>}
      <span className="stx-tile-face" aria-hidden="true">
        <i className="stx-ico" />
      </span>
      {/* Both are hidden from the accessibility tree: the button already
          carries the name in `aria-label`, and a percentage read out twice —
          once here, once in the panel — is noise rather than information. */}
      <span className="stx-tile-name" aria-hidden="true">
        {node.name}
      </span>
      {/* The tier is a fact about the skill, so every tile carries it —
          including the diamonds, where it says how deep the subject behind it
          goes. The percentage is about the reader and only appears where there
          is progress to report. */}
      <span className="stx-tile-meta" aria-hidden="true">
        <span className="stx-tile-tier">{DIFFICULTY_LABEL[node.difficulty]}</span>
        {!nav
          && (node.status === 'locked' && gate ? (
            <span className="stx-tile-gate" data-left={gate.need - gate.met}>
              {gate.met}/{gate.need}
            </span>
          ) : (
            <span className="stx-tile-pct">{Math.round(node.percent)}%</span>
          ))}
      </span>
    </button>
  );
}
