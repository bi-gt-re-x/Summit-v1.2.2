/**
 * One prerequisite, as a line.
 *
 * A path and a class, and the class is the whole component — the `d` was worked
 * out by `layoutGraph` in the same coordinate space the nodes are placed in, so
 * there is nothing to measure and nothing to keep in sync while the canvas is
 * panned or zoomed.
 *
 * The four states differ in weight and dash as well as colour: a locked path is
 * a thin dashed hairline, an available one solid and quiet, an in-progress one
 * solid and carrying the accent, a completed one the heaviest of the four. A
 * reader tracing back from a node they want should be able to see where the
 * route they have already taken stops, and that has to survive being looked at
 * from a long way out.
 *
 * `is-lit` is the selection: every path touching the chosen node comes forward
 * so its prerequisites and what it opens read as one run rather than as two
 * lines that happen to meet it.
 *
 * `is-faded` is the other half of that, and only exists while a focus layer is
 * on: a line with a dimmed node at either end goes back with it, because a
 * bright wire running into a faded tile is the one thing that makes a dimmed
 * canvas look broken rather than quiet.
 */
import type { PlacedEdge } from '@/utils/skillGraph';

export interface SkillConnectionProps {
  edge: PlacedEdge;
  /** Touching the selected node — drawn forward. */
  lit?: boolean;
  /** Running into something the focus layer has dimmed — drawn back. */
  faded?: boolean;
}

export function SkillConnection({ edge, lit = false, faded = false }: SkillConnectionProps) {
  return (
    <path
      className={`stx-wire is-${edge.state} is-${edge.kind}${lit ? ' is-lit' : ''}${
        faded ? ' is-faded' : ''
      }`}
      d={edge.d}
      fill="none"
    />
  );
}
