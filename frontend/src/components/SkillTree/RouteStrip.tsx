/**
 * The route through the branch, as one line above the canvas.
 *
 * ## What it is for
 *
 * Forty squares and sixty lines is a shape, not a sentence, and a reader
 * working out "how did I get to this node and where does it go" was tracing
 * edges with their eyes. The chain is already in the graph — this states it.
 *
 *     Fractions › Algebra › Linear Equations › **Systems** › Quadratics
 *
 * Everything up to the bold one is `requires` read backwards to a root, which
 * is the same longest-path walk `layoutGraph` ranks by, so the strip and the
 * canvas can never disagree about where a node sits. The one after it is
 * `nextAfter` — and it is drawn differently, because the route is a fact about
 * the curriculum and the next step is a recommendation. Two kinds of claim on
 * one line have to be told apart.
 *
 * ## Every crumb is a control
 *
 * Clicking one selects that node, so the strip is a way of walking the branch
 * rather than a caption on it. The last real crumb is the one you are on and is
 * not a button — a control that does nothing when pressed teaches a reader to
 * stop pressing them.
 *
 * ## It does not draw on a route of one
 *
 * A foundation node with nothing above it has no route, and "Systems" on its
 * own under a heading saying "your route" is a heading lying about one word.
 * The next step alone is not enough either: that is the job of the button in
 * the panel.
 */
import type { FocusRead } from '@/skills/route';
import type { GraphNode } from '@/utils/skillGraph';

export interface RouteStripProps {
  focus: FocusRead;
  /** True while a double-click is holding the whole chain lit. */
  traced: boolean;
  onSelect: (node: GraphNode) => void;
  /** Drop the focus and put the canvas back. Absent while nothing is selected. */
  onClear?: () => void;
}

export function RouteStrip({ focus, traced, onSelect, onClear }: RouteStripProps) {
  const { route, next } = focus;
  if (route.length < 2) return null;

  const last = route.length - 1;

  return (
    <nav className={`stx-route${traced ? ' is-traced' : ''}`} aria-label="Your route through this branch">
      <span className="stx-route-label">
        {traced ? `Route here · ${route.length} skills` : 'Your route'}
      </span>

      <ol className="stx-route-path">
        {route.map((node, at) => (
          <li key={node.id} className={at === last ? 'is-here' : undefined}>
            {at === last ? (
              <span aria-current="true">{node.name}</span>
            ) : (
              <button type="button" onClick={() => onSelect(node)}>
                {node.name}
              </button>
            )}
          </li>
        ))}

        {/* Not part of the route, and drawn so it cannot be mistaken for it:
            everything left of the arrow is what the curriculum says, this is
            what the page suggests. */}
        {next && (
          <li className="is-next">
            <button type="button" onClick={() => onSelect(next)}>
              {next.name}
            </button>
          </li>
        )}
      </ol>

      {onClear && (
        <button type="button" className="stx-route-clear" onClick={onClear}>
          Clear focus
        </button>
      )}
    </nav>
  );
}
