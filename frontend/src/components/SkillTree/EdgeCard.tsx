/**
 * What a line between two tiles means, when somebody asks it.
 *
 * ## Why a line is worth a click
 *
 * The lattice draws two kinds of edge and the whole difference between them —
 * *this is why that is locked* against *this is merely worth doing first* — is
 * carried by a dash and one word in a legend a reader looks at once. The edges
 * are where the structure of a subject actually lives, and they were the only
 * thing on the canvas that could not be interrogated.
 *
 * ## The words are derived, not authored
 *
 * There is no per-edge prose in the tree data and there should not be: sixty
 * trees' worth of "Quadratics assumes you can move variables across an equals
 * sign" is a maintenance burden that would be half-written within a month and
 * wrong within two. What this says instead is what the graph already knows —
 * which node gates which, whether the gate is met, and whether the suggestion
 * changes anything — phrased so a reader can act on it. See `improvePlan` in
 * skills/improve for the same trade made about a different kind of text.
 *
 * ## Both ends are a way out
 *
 * The card's two buttons select the nodes it names. That is the point of it:
 * a reader clicks a line because they are tracing something, and the useful
 * end of the answer is arriving at one of the two ends of it.
 */
import { useEffect, useRef } from 'react';
import { STATUS_LABEL, type GraphNode, type PlacedEdge } from '@/utils/skillGraph';

export interface EdgeCardProps {
  edge: PlacedEdge;
  /** The node the line leaves. */
  from: GraphNode;
  /** The node it arrives at. */
  to: GraphNode;
  /** Where the pointer was, in viewport pixels. */
  at: { x: number; y: number };
  /** Select a node and scroll the canvas to it. */
  onOpen: (id: string) => void;
  onClose: () => void;
}

/** Card width, and the margin it keeps off the edge of the window. */
const WIDTH = 288;
const GAP = 12;

export function EdgeCard({ edge, from, to, at, onOpen, onClose }: EdgeCardProps) {
  const card = useRef<HTMLDivElement>(null);
  const gate = edge.kind === 'requires';
  const met = from.status === 'complete';

  /* Escape, and a press anywhere else. Both are the same gesture — *not this*
     — and a card with two buttons in it has to be dismissable by something
     other than the two buttons. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (!card.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // The listener goes on in the *next* frame: the click that opened this
    // card is still travelling, and a listener added during it would catch it
    // and close the card in the same gesture that asked for it.
    const soon = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      window.clearTimeout(soon);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const style = {
    left: Math.max(GAP, Math.min(window.innerWidth - WIDTH - GAP, at.x - WIDTH / 2)),
    top: Math.min(window.innerHeight - GAP - 210, at.y + GAP),
    width: WIDTH,
  };

  return (
    <div
      ref={card}
      className={`stx-edge${gate ? '' : ' is-suggested'}`}
      style={style}
      role="dialog"
      aria-label={gate ? 'Prerequisite' : 'Recommendation'}
    >
      <p className="stx-edge-kind">{gate ? 'Prerequisite' : 'Recommended'}</p>

      <p className="stx-edge-pair">
        <b>{from.name}</b>
        <i aria-hidden="true">{gate ? '→' : '⇢'}</i>
        <b>{to.name}</b>
      </p>

      <p className="stx-edge-say">
        {gate ? (
          met ? (
            <>
              <b>{to.name}</b> was gated behind <b>{from.name}</b>, and that is done — this line is
              part of the route you have already taken.
            </>
          ) : (
            <>
              <b>{to.name}</b> will not open until <b>{from.name}</b> is finished. It is{' '}
              {STATUS_LABEL[from.status].toLowerCase()}
              {from.status === 'progress' ? ` at ${Math.round(from.percent)}%` : ''}.
            </>
          )
        ) : (
          <>
            A suggestion rather than a gate. <b>{to.name}</b> is open whether or not you do{' '}
            <b>{from.name}</b> first — it is here because it is the easier way in, not because
            anything is waiting on it.
          </>
        )}
      </p>

      <div className="stx-edge-ends">
        <button type="button" onClick={() => onOpen(from.id)}>
          {from.name}
        </button>
        <button type="button" onClick={() => onOpen(to.id)}>
          {to.name}
        </button>
      </div>
    </div>
  );
}
