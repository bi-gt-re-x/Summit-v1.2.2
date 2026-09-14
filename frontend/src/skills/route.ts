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
import { unlockedBy, type GraphNode, type SkillGraph } from '@/utils/skillGraph';

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
