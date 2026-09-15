/**
 * Where the reader is on a lattice, and the route that got them there.
 *
 * ## The question this answers
 *
 * A lattice is forty squares and sixty lines, and until now nothing on it said
 * *you are here*. A reader had to read tile percentages and infer their own
 * position from them — which is the one job a map is supposed to do for you.
 *
 * Everything below is a pure function of the graph the canvas is already
 * drawing. Nothing is fetched, nothing is stored, and no figure here is new:
 * `currentSkill` is a reading of statuses the feed already decided, and
 * `routeTo` is a walk of the `requires` edges that are already on screen as
 * lines. That matters for the same reason it matters in
 * components/Subject/model — a page that invents a position cannot be argued
 * with.
 *
 * ## Why this is not in utils/skillGraph
 *
 * That file is the renderer's model and states, at the top, that it knows
 * nothing about what a node *means* — it is told a status and draws it, and it
 * is deliberately unable to say why anything is locked. "Which of these forty
 * nodes is the one you are working on" is a judgement about meaning, so it
 * lives here with the rest of the judgements (skills/improve, skills/standing)
 * and the renderer stays generic.
 *
 * ## The three weights, and why only three
 *
 * A focus layer that gave prerequisites one shade, unlocks another and
 * suggestions a third would be four visual languages on one canvas, and a
 * reader cannot hold four. What is actually being asked is "which of these
 * concerns me" — so: **here**, **near** (anything one edge away, or on the
 * traced route), and **dim**. The panel names the relationships in words,
 * where words are better than shades.
 */
import { difficultyRank } from './types';
import { unlockedBy, type GraphNode, type NodeStatus, type SkillGraph } from '@/utils/skillGraph';

/** How much weight a tile gets while a focus is on. */
export type Emphasis = 'here' | 'near' | 'dim';

export interface FocusRead {
  /** The node the layer is centred on. */
  here: GraphNode;
  /**
   * The prerequisite chain from a root down to `here`, `here` last.
   *
   * The *longest* chain rather than the shortest, matching `layoutGraph`'s own
   * ranking — a node reachable both directly and the long way round is drawn
   * below everything it depends on, so the route the canvas shows and the route
   * this states have to be the same one.
   */
  route: GraphNode[];
  /** Immediate prerequisites, in the order the node names them. */
  requires: GraphNode[];
  /** How many of those are finished. */
  met: number;
  /** What this node opens. */
  unlocks: GraphNode[];
  /** Suggested rather than required, either way along a dashed edge. */
  suggests: GraphNode[];
  /** The single best thing to do after this one, or null where it opens nothing. */
  next: GraphNode | null;
}

/**
 * The node the reader is most plausibly working on.
 *
 * In progress beats available, because something part-done is where attention
 * already is; within a band, furthest along wins, and a tie goes to the lower
 * rung — the bottom of the ladder is where an unfinished pair should be
 * finished first.
 *
 * `skip` is the navigation diamonds. They carry a status like any other node
 * and a doorway is never the thing you are working on; the page passes
 * `navTargets`' keys, because the graph itself has no idea which nodes are
 * doorways (see skills/subjectTrees).
 */
export function currentSkill(
  graph: SkillGraph,
  skip: ReadonlySet<string> = new Set(),
): GraphNode | null {
  const real = graph.nodes.filter((node) => !skip.has(node.id));
  const best = (nodes: GraphNode[]): GraphNode | null =>
    nodes.reduce<GraphNode | null>((winner, node) => {
      if (!winner) return node;
      if (node.percent !== winner.percent) return node.percent > winner.percent ? node : winner;
      return difficultyRank(node.difficulty) < difficultyRank(winner.difficulty) ? node : winner;
    }, null);

  return (
    best(real.filter((node) => node.status === 'progress'))
    ?? best(real.filter((node) => node.status === 'available'))
    ?? null
  );
}

/**
 * The longest prerequisite chain ending at `id`, root first.
 *
 * Depth-first with a path-local seen set, so a cycle in a badly authored tree
 * cannot hang it — the same guarantee `layoutGraph` gives its ranking, and for
 * the same reason: this runs on authored data that a build check validates but
 * a browser should not trust absolutely.
 */
export function routeTo(graph: SkillGraph, id: string): GraphNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const longest = new Map<string, GraphNode[]>();

  const walk = (at: string, seen: Set<string>): GraphNode[] => {
    const node = byId.get(at);
    if (!node) return [];
    const cached = longest.get(at);
    if (cached) return cached;

    let best: GraphNode[] = [];
    for (const need of node.requires) {
      if (seen.has(need) || !byId.has(need)) continue;
      seen.add(need);
      const chain = walk(need, seen);
      seen.delete(need);
      if (chain.length > best.length) best = chain;
    }

    const answer = [...best, node];
    longest.set(at, answer);
    return answer;
  };

  return walk(id, new Set([id]));
}

/**
 * The one thing worth doing after this node, or null.
 *
 * Reachable beats blocked — a skill that is open the moment this one lands is
 * a better answer than one still waiting on three others — then the lower rung,
 * then whatever is furthest along. Deliberately one node rather than a ranked
 * list: the route strip has room for a next step and no room for an argument
 * about which of four it should be.
 */
export function nextAfter(graph: SkillGraph, id: string): GraphNode | null {
  const opens = unlockedBy(graph, id);
  if (opens.length === 0) return null;

  return opens.reduce<GraphNode | null>((winner, node) => {
    if (!winner) return node;
    const ready = (one: GraphNode) => one.requires.filter((need) => need !== id).length;
    if (ready(node) !== ready(winner)) return ready(node) < ready(winner) ? node : winner;
    const rank = difficultyRank(node.difficulty) - difficultyRank(winner.difficulty);
    if (rank !== 0) return rank < 0 ? node : winner;
    return node.percent > winner.percent ? node : winner;
  }, null);
}

/** Everything the focus layer and the route strip read, worked out once. */
export function focusOn(graph: SkillGraph, id: string): FocusRead | null {
  const here = graph.nodes.find((node) => node.id === id);
  if (!here) return null;

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const pick = (ids: readonly string[]) =>
    ids.map((one) => byId.get(one)).filter((one): one is GraphNode => Boolean(one));

  const requires = pick(here.requires);
  const unlocks = unlockedBy(graph, id);

  /* Dashed edges run both ways and the node only stores its own end, so the
     other half is found by asking every node what it recommends. */
  const suggests = [
    ...pick(here.recommends ?? []),
    ...graph.nodes.filter((node) => (node.recommends ?? []).includes(id)),
  ].filter((node, at, all) => all.findIndex((one) => one.id === node.id) === at);

  return {
    here,
    route: routeTo(graph, id),
    requires,
    met: requires.filter((node) => node.status === 'complete').length,
    unlocks,
    suggests,
    next: nextAfter(graph, id),
  };
}

/**
 * Node id → weight, for the tiles and the wires.
 *
 * Only built while a focus is *on*. A canvas that dimmed thirty-six of its
 * forty tiles the moment it loaded would be a canvas that opens greyed out,
 * which is why the page draws the "you are here" marker without this map until
 * the reader selects something. See the note at the top of pages/SkillTrees.
 *
 * `traced` widens `near` from the immediate neighbours to the whole
 * prerequisite chain — what a double-click asks for, and the one case where
 * the useful answer is a run of eight tiles rather than a cluster of four.
 */
export function emphasise(
  graph: SkillGraph,
  focus: FocusRead,
  traced = false,
): Map<string, Emphasis> {
  const near = new Set<string>([
    ...focus.requires.map((node) => node.id),
    ...focus.unlocks.map((node) => node.id),
    ...focus.suggests.map((node) => node.id),
    ...(traced ? focus.route.map((node) => node.id) : []),
  ]);
  near.delete(focus.here.id);

  return new Map(
    graph.nodes.map((node) => [
      node.id,
      node.id === focus.here.id ? 'here' : near.has(node.id) ? 'near' : 'dim',
    ]),
  );
}

// --------------------------------------------------------------------------
// Degrees of lockedness
// --------------------------------------------------------------------------
export interface Gate {
  /** Prerequisites finished. */
  met: number;
  /** Prerequisites there are. */
  need: number;
}

/**
 * How far through its prerequisites each gated node is.
 *
 * "Locked" was one word covering two states a reader feels completely
 * differently about: one thing left, and four. The first is next week and the
 * second is next term, and a tile that says the same about both has told
 * nobody anything — which is how a lattice ends up looking like a wall of dead
 * ends rather than a set of near-term targets.
 *
 * Only nodes that are gated at all. A foundation with nothing above it has no
 * fraction, and `0 of 0` on a tile is worse than a blank.
 */
export function gatesOf(graph: SkillGraph): Map<string, Gate> {
  const byId = new Map(graph.nodes.map((one) => [one.id, one]));
  const gates = new Map<string, Gate>();

  for (const node of graph.nodes) {
    if (node.requires.length === 0) continue;
    gates.set(node.id, {
      met: node.requires.filter((id) => byId.get(id)?.status === 'complete').length,
      need: node.requires.length,
    });
  }
  return gates;
}

/**
 * Which prerequisite to go and do first, or null when nothing is in the way.
 *
 * What turns a locked node from a dead end into a route: the panel's action on
 * one is "start with the thing that is blocking it" rather than a greyed-out
 * button repeating the word the tile already said.
 *
 * Part-done first, then open, then the fewest blockers of its own, then the
 * lower rung — the same ordering `opportunities` argues for, because it is the
 * same question asked of a smaller set.
 */
export function nearestBlocker(graph: SkillGraph, node: GraphNode): GraphNode | null {
  const byId = new Map(graph.nodes.map((one) => [one.id, one]));
  const blocking = node.requires
    .map((id) => byId.get(id))
    .filter((one): one is GraphNode => one !== undefined && one.status !== 'complete');

  const band = (one: GraphNode) =>
    one.status === 'progress' ? 0 : one.status === 'available' ? 1 : 2;

  return blocking.reduce<GraphNode | null>((winner, one) => {
    if (!winner) return one;
    if (band(one) !== band(winner)) return band(one) < band(winner) ? one : winner;
    const mine = blockersOf(graph, one);
    const theirs = blockersOf(graph, winner);
    if (mine !== theirs) return mine < theirs ? one : winner;
    return difficultyRank(one.difficulty) < difficultyRank(winner.difficulty) ? one : winner;
  }, null);
}

// --------------------------------------------------------------------------
// What to do next
// --------------------------------------------------------------------------
/** How many of a node's prerequisites are still outstanding. */
function blockersOf(graph: SkillGraph, node: GraphNode): number {
  const byId = new Map(graph.nodes.map((one) => [one.id, one]));
  return node.requires.filter((id) => byId.get(id)?.status !== 'complete').length;
}

export interface Opportunity {
  node: GraphNode;
  /** Prerequisites still in the way. Zero on anything that can be started now. */
  blocked: number;
  /** How many skills it opens. */
  opens: number;
  /** Why it is on the list, in one phrase. */
  why: string;
}

/** How many the overlay offers. Three is a choice; six is a second lattice. */
export const CHANCES = 3;

/**
 * The handful of skills worth starting next, best first.
 *
 * This is not a new recommendation engine and deliberately does not become
 * one. It is a *reading of the graph the page is already drawing* — status,
 * percentage, prerequisites and what each node opens, all of which are on
 * screen as colour and lines. The lattice stays an authored hierarchy; what
 * this adds is the sentence a reader would otherwise have to assemble by
 * scanning forty tiles for the green ones.
 *
 * Three bands, and the order between them is the whole argument:
 *
 *   1. **Part-done.** Finishing something is worth more than starting
 *      something, and the closest to done is worth the most.
 *   2. **Open now.** Nothing in the way. The lower rung first, for the reason
 *      `currentSkill` gives — an unfinished pair is finished from the bottom.
 *   3. **One prerequisite away.** A locked node with a single blocker is not a
 *      dead end, it is next week, and a reader who cannot see the difference
 *      between that and one blocked by four has been told nothing useful by
 *      the word "Locked".
 *
 * Anything blocked by two or more is left off. That is not a near-term target,
 * and a list that included it would be a list of the whole tree.
 */
export function opportunities(
  graph: SkillGraph,
  skip: ReadonlySet<string> = new Set(),
): Opportunity[] {
  const rows = graph.nodes
    .filter((node) => !skip.has(node.id) && node.status !== 'complete')
    .map((node) => {
      const blocked = blockersOf(graph, node);
      const opens = unlockedBy(graph, node.id).length;
      const band =
        node.status === 'progress' ? 0 : node.status === 'available' ? 1 : blocked === 1 ? 2 : 3;
      return { node, blocked, opens, band };
    })
    .filter((row) => row.band < 3);

  rows.sort((a, b) => {
    if (a.band !== b.band) return a.band - b.band;
    // Part-done: closest to finished.
    if (a.band === 0) return b.node.percent - a.node.percent;
    const rung = difficultyRank(a.node.difficulty) - difficultyRank(b.node.difficulty);
    if (rung !== 0) return rung;
    return b.opens - a.opens;
  });

  return rows.slice(0, CHANCES).map(({ node, blocked, opens, band }) => ({
    node,
    blocked,
    opens,
    why:
      band === 0
        ? `${Math.round(node.percent)}% done`
        : band === 1
          ? 'Open now'
          : '1 prerequisite away',
  }));
}

// --------------------------------------------------------------------------
// One status at a time
// --------------------------------------------------------------------------
/** What the band across the top can narrow the canvas to. */
export type Lens = NodeStatus | 'unlocked';

export const LENS_WORD: Record<Lens, string> = {
  complete: 'mastered',
  progress: 'in progress',
  available: 'open now',
  locked: 'locked',
  unlocked: 'unlocked',
};

/**
 * The same three weights, decided by status rather than by one node.
 *
 * The figures across the top were six counts nobody could act on: a reader who
 * learned they had twelve locked skills still had to find them. Pressing one
 * narrows the canvas to what it counts, which costs a click and answers the
 * question the figure raised.
 *
 * Nothing is `here` — a lens has no centre, and the "you are here" marker is
 * drawn from the reader's position rather than from this, so it survives a
 * filter being on. That is deliberate: losing your own position the moment you
 * ask "where are the locked ones" is losing the one thing the canvas was for.
 */
export function spotlight(
  graph: SkillGraph,
  lens: Lens,
  skip: ReadonlySet<string> = new Set(),
): Map<string, Emphasis> {
  const hit = (node: GraphNode) =>
    lens === 'unlocked' ? node.status !== 'locked' : node.status === lens;

  return new Map(
    graph.nodes.map((node) => [node.id, !skip.has(node.id) && hit(node) ? 'near' : 'dim']),
  );
}
