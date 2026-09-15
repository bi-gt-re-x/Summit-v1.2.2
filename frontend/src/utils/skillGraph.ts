/**
 * The shape a skill tree is drawn from — any skill tree.
 *
 * ## Why this knows nothing about what a node means
 *
 * There used to be a second file, utils/skillTree, that knew exactly what a
 * skill tree *meant* on this account: Depth was XP on the mastery ladder,
 * Output was finished tasks, a node opened when a threshold was crossed. It was
 * one specific tree derived from one specific record, and the page was once
 * written against its shape — three named branches, five nodes each, a fan of
 * exactly three curves. Nothing rendered it in the end and it has been deleted.
 *
 * This file deliberately knew none of that, and that is why it outlived it. A graph here is nodes and edges and a status
 * per node, and that is the whole model. It cannot say why a node is locked; it
 * is told. That split is the point: the renderer that hangs off this file draws
 * any number of nodes, edges, branches and categories in any arrangement, so
 * the day a generator produces a real per-account skill graph, the drawing code
 * does not change — only what feeds it. `graphFromSubjectTree` in
 * skills/subjectTrees is today's feed and is deliberately the only thing that
 * knows both shapes.
 *
 * ## What this file does *not* do
 *
 * No progression, no unlock rules, no completion. `status` and `percent` arrive
 * decided. `requires` is drawn as an edge and read out in the panel, and is
 * never consulted to work out whether something is open — a graph whose statuses
 * disagree with its edges will render exactly what it was given, which is the
 * behaviour that makes a bad feed visible instead of silently corrected.
 */

/** Where a node stands. The four states everything visual keys off. */
export type NodeStatus = 'locked' | 'available' | 'progress' | 'complete';

/**
 * The progression ladder, re-exported rather than redeclared.
 *
 * It is declared in skills/types, because how hard a skill is is a fact about
 * the skill and not about the drawing of it, and two ladders that had to agree
 * would eventually not. This file keeps the names so nothing downstream has to
 * know where they came from; the import is one type and two constants, and
 * skills/ depends on nothing in return — no React, no DOM, no renderer.
 */
import { DIFFICULTY_ORDER, DIFFICULTY_LABEL, type Difficulty } from '@/skills/types';

export { DIFFICULTY_ORDER as DIFFICULTIES, DIFFICULTY_LABEL };
export type { Difficulty };

export const STATUS_LABEL: Record<NodeStatus, string> = {
  locked: 'Locked',
  available: 'Available',
  progress: 'In progress',
  complete: 'Completed',
};

export interface GraphNode {
  id: string;
  /** What the node is called: "Binary Search", "Apprentice". */
  name: string;
  /** One or two sentences for the detail panel. */
  blurb: string;
  /** The reader's own heading. Free text — the toolbar builds its filter from
   *  whatever turns up rather than from a fixed list. */
  category: string;
  difficulty: Difficulty;
  status: NodeStatus;
  /** 0-100. What the ring and the bar draw. */
  percent: number;
  /** XP the node is worth, for the reward line. Zero prints nothing. */
  xp: number;
  /** Where the account stands and what opens the node, in `unit`. */
  have: number;
  need: number;
  unit: string;
  /** ISO day it completed, or '' — the completion date, where there is one. */
  on: string;
  /** Node ids that come before this one. Drawn as the incoming edges. */
  requires: string[];
  /** The requirement in words, printed on a locked node: "40 tasks". */
  gate: string;
  /**
   * Extra rows for the detail panel, in the feed's own vocabulary.
   *
   * Generic on purpose: the renderer has no idea what an estimated time or a
   * skill type is, and adding a field for each would make this model the union
   * of every feed that will ever exist. A feed states its own facts and they are
   * printed in order.
   */
  facts?: { label: string; value: string }[];
  /** Drawn as chips under the description. Absent draws nothing. */
  tags?: string[];
  /**
   * Draw this one quieter than its neighbours.
   *
   * What "quieter" means is the renderer's business and what earns it is the
   * feed's: the generated-tree feed marks a node secondary when the goal does not
   * oblige you to do it — an option on a choice, or a branch off the path — and a
   * different feed could mean something else entirely by it. Kept as one boolean
   * rather than as an `optional` field for that reason: the model would otherwise
   * be learning what a prerequisite rule is, which is exactly what it is arranged
   * not to know.
   */
  secondary?: boolean;
  /**
   * The drawing on the node, named by filename without the extension — the
   * files in utils/icons/tree_icons, served at `/static/icons/tree_icons`.
   *
   * A name rather than a component or a URL: the model stays free of both React
   * and of where the assets happen to be mounted, and a feed that has no icons
   * simply omits it. What a missing one falls back to is the renderer's
   * business, not the model's.
   */
  icon?: string;
  /**
   * Nodes worth doing first without being required to. Drawn as a second kind
   * of edge — dashed, and reading "recommended" rather than "prerequisite" —
   * and deliberately *not* part of `requires`: these must not gate a node or
   * move it down a rank, or a suggestion would silently become a rule.
   */
  recommends?: string[];
}

export interface SkillGraph {
  id: string;
  name: string;
  nodes: GraphNode[];
}

/** How a connection is drawn, decided by the two nodes it joins. */
export type EdgeState = 'locked' | 'available' | 'active' | 'complete';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
/**
 * Node size and spacing, in canvas units.
 *
 * Held here rather than in the stylesheet because the layout below does the
 * arithmetic and the SVG connections are drawn in the same coordinate space —
 * three things that have to agree, so they read one number. The stylesheet sizes
 * a node from these via custom properties rather than repeating them.
 */
export const GEOM = {
  // Widened from 216 once the library feed arrived: "Time and Space Complexity"
  // beside a difficulty badge and an XP chip had about nine characters to work
  // with, and a canvas of ellipses is a canvas you have to click to read.
  nodeW: 244,
  nodeH: 84,
  /** Gap between siblings, and between one rank and the next. */
  colGap: 26,
  rowGap: 82,
  /** Breathing room around the whole drawing. */
  pad: 44,
};

/** The shape of a geometry `layoutGraph` can be handed. */
export type Geometry = typeof GEOM;

/**
 * A tight, icon-sized geometry — square nodes packed close, the way a talent
 * lattice reads rather than a wall of labelled cards. The subject-tree feed
 * lays out with this; the card feeds keep {@link GEOM}. Same algorithm, same
 * coordinate space — only the numbers the arithmetic runs on change.
 */
export const LATTICE_GEOM: Geometry = {
  nodeW: 64,
  nodeH: 64,
  // Both gaps are set by the label rather than by the tile: a name sits under
  // each square, so siblings need room for one to stand between them and each
  // rank needs room for one to hang below it. Tighter than this and the names
  // touch, which is the one thing that makes a lattice unreadable.
  // Both gaps are set by what hangs off a tile rather than by the tile: a name
  // of up to two lines and a percentage sit under each one, so siblings need
  // room for a label to stand between them and each rank needs room for one to
  // hang below it. The column gap is also what stops the drawing outgrowing a
  // canvas that now shares its row with a 340px detail panel.
  // Room for what hangs off a tile: a name of up to two lines, then a row
  // holding the difficulty chip and the percentage. The column gap has to clear
  // that row, which is wider than the 64px tile, or two neighbours' chips
  // collide before their tiles come close.
  colGap: 96,
  rowGap: 118,
  pad: 56,
};

export interface PlacedNode {
  node: GraphNode;
  /** Top-left of the node box, in canvas units. */
  x: number;
  y: number;
  /** Which rank it sits on — 0 nearest the top. */
  rank: number;
}

export interface PlacedEdge {
  id: string;
  from: string;
  to: string;
  state: EdgeState;
  /** The cubic path, ready for a `d` attribute. */
  d: string;
  /** What the line means: something you must do first, or something worth
   *  doing first. The renderer draws the second one dashed. */
  kind: 'requires' | 'recommends';
}

/**
 * One connected piece of the drawing, and the box it ended up in.
 *
 * The packer has always known these — it lays each piece out on its own and
 * shelves them — and threw them away on the way out, which left the gaps
 * between them looking like an accident rather than the statement they are.
 * Handing them back costs nothing and lets a renderer say *these are separate
 * branches* over the space it already put there.
 *
 * Geometry only. Which node a piece should be *named* after is a judgement and
 * is made by whoever draws it.
 */
export interface GraphRegion {
  /** Every node in the piece, in the order the feed sent them. */
  ids: string[];
  /** The box the piece occupies, in canvas units, node boxes included. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
  /** The connected pieces. One entry for a graph that is all one drawing. */
  regions: GraphRegion[];
}

/**
 * How an edge is drawn, from the node it points *at*.
 *
 * The path takes its state from its destination rather than from its source or
 * from both: what a reader traces a line to find out is whether the thing on
 * the end of it is open, and a line whose two ends disagreed would have to pick
 * one anyway. A completed node's incoming paths are complete, which is what
 * makes the route you actually took legible from across the canvas.
 */
export function edgeState(target: GraphNode | undefined): EdgeState {
  if (!target) return 'locked';
  if (target.status === 'complete') return 'complete';
  if (target.status === 'progress') return 'active';
  if (target.status === 'available') return 'available';
  return 'locked';
}

/**
 * Place a graph on the canvas.
 *
 * Two passes and no measurement, so it is stable under zoom and needs no
 * observer:
 *
 * **Rank** is the longest path to the node from any node with nothing above it.
 * Longest rather than shortest, so a node that is reachable both directly and
 * the long way round sits below everything it depends on rather than beside the
 * first of them. That is what makes the canvas read foundation-to-mastery down
 * the page whatever shape the graph is.
 *
 * **Position across** is the tidy-tree walk: leaves take the next free slot,
 * every other node centres over the ones under it. A node with several
 * prerequisites is placed under the first one listed and joined to the rest by
 * a line that crosses — a real DAG cannot always be drawn without crossings,
 * and choosing a primary parent is how the drawing stays readable when it
 * cannot.
 *
 * **A forest is packed, not laid end to end.** A graph with several roots that
 * never join is several drawings, and the first version ran them along one row:
 * an account with nineteen subjects got a canvas 15,452px wide and 1,168 tall,
 * which is eleven screens of sideways scrolling to see a tree that is seven
 * rows deep. Each connected piece is now laid out on its own and the pieces are
 * shelved into rows against a target width derived from their total area, so
 * the canvas comes out roughly the shape of a screen however many roots arrive.
 * A graph with one root — every generated goal tree — has one piece, and gets
 * exactly the layout it got before.
 *
 * Pieces keep the order they arrived in rather than being sorted by height, which
 * is the usual trick for packing them tightly. The order means something to the
 * reader — the feed sends the biggest subject first — and a few hundred pixels
 * of ragged edge is a cheaper price than a canvas that reorders itself.
 *
 * Cycles cannot hang it: rank is computed with a seen-set per walk, and a node
 * reached again keeps the deeper of the two ranks.
 */
export function layoutGraph(graph: SkillGraph, geom: Geometry = GEOM): GraphLayout {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const kids = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const node of graph.nodes) {
    // A requirement naming a node that is not in the graph — filtered out, or
    // a feed that referenced something it did not send — is dropped rather than
    // drawn to nowhere.
    const real = node.requires.filter((id) => byId.has(id));
    parents.set(node.id, real);
    for (const id of real) kids.set(id, [...(kids.get(id) ?? []), node.id]);
  }

  // ---- rank ---------------------------------------------------------------
  const rank = new Map<string, number>();
  const rankOf = (id: string, seen: Set<string>): number => {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    const above = parents.get(id) ?? [];
    const value = above.length === 0
      ? 0
      : Math.max(...above.map((parent) => rankOf(parent, seen) + 1));
    seen.delete(id);
    rank.set(id, value);
    return value;
  };
  for (const node of graph.nodes) rankOf(node.id, new Set());

  // ---- connected pieces ---------------------------------------------------
  // Undirected: two nodes are in one piece if either requires the other, however
  // far apart. Order follows `graph.nodes`, so the piece holding the feed's first
  // node is shelved first.
  const piece = new Map<string, number>();
  const pieces: string[][] = [];
  for (const node of graph.nodes) {
    if (piece.has(node.id)) continue;
    const group: string[] = [];
    const queue = [node.id];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (piece.has(id)) continue;
      piece.set(id, pieces.length);
      group.push(id);
      queue.push(...(parents.get(id) ?? []), ...(kids.get(id) ?? []));
    }
    pieces.push(group);
  }

  // ---- position across, one piece at a time -------------------------------
  const step = geom.nodeW + geom.colGap;
  const centre = new Map<string, number>();

  const layOut = (members: readonly string[]) => {
    let slot = 0;
    const walk = (id: string, seen: Set<string>): number => {
      const cached = centre.get(id);
      if (cached !== undefined) return cached;
      if (seen.has(id)) return slot * step;
      seen.add(id);

      // Only the children this node is the *primary* parent of: a node under two
      // prerequisites belongs to the first one, or it would be counted twice and
      // both parents would centre on a span they do not own.
      const mine = (kids.get(id) ?? []).filter((kid) => (parents.get(kid) ?? [])[0] === id);

      let x: number;
      if (mine.length === 0) {
        x = slot * step;
        slot += 1;
      } else {
        const spans = mine.map((kid) => walk(kid, seen));
        x = (Math.min(...spans) + Math.max(...spans)) / 2;
      }
      seen.delete(id);
      centre.set(id, x);
      return x;
    };

    for (const id of members) {
      if ((parents.get(id) ?? []).length === 0) walk(id, new Set());
    }
    // Anything left is inside a cycle, or hangs off one. It still gets a slot.
    for (const id of members) walk(id, new Set());
  };
  for (const members of pieces) layOut(members);

  const rowStep = geom.nodeH + geom.rowGap;

  // ---- shelve the pieces --------------------------------------------------
  const size = pieces.map((members) => {
    const xs = members.map((id) => centre.get(id) ?? 0);
    const ranks = members.map((id) => rank.get(id) ?? 0);
    return {
      width: Math.max(...xs) - Math.min(...xs) + geom.nodeW,
      height: Math.max(...ranks) * rowStep + geom.nodeH,
      left: Math.min(...xs),
    };
  });

  // Aim for a canvas a bit wider than it is tall — the shape of the window it is
  // read in. With one piece the target is that piece's own width, so nothing is
  // wrapped that was never several drawings to begin with.
  const area = size.reduce((sum, box) => sum + box.width * box.height, 0);
  const widest = size.reduce((max, box) => Math.max(max, box.width), 0);
  const target = Math.max(widest, Math.sqrt(area * 1.6));

  const offset: { x: number; y: number }[] = [];
  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  size.forEach((box, index) => {
    if (shelfX > 0 && shelfX + box.width > target) {
      shelfX = 0;
      shelfY += shelfH + geom.rowGap * 2;
      shelfH = 0;
    }
    offset[index] = { x: shelfX - box.left, y: shelfY };
    shelfX += box.width + geom.colGap * 2;
    shelfH = Math.max(shelfH, box.height);
  });

  const placed: PlacedNode[] = graph.nodes.map((node) => {
    const shelf = offset[piece.get(node.id) ?? 0] ?? { x: 0, y: 0 };
    return {
      node,
      x: (centre.get(node.id) ?? 0) + shelf.x + geom.pad,
      y: (rank.get(node.id) ?? 0) * rowStep + shelf.y + geom.pad,
      rank: rank.get(node.id) ?? 0,
    };
  });

  const at = new Map(placed.map((entry) => [entry.node.id, entry]));

  const edges: PlacedEdge[] = [];

  /** One curve between two placed nodes, however the two are related. */
  const join = (fromId: string, toId: string, kind: PlacedEdge['kind']) => {
    const from = at.get(fromId);
    const to = at.get(toId);
    if (!from || !to) return;
    const x1 = from.x + geom.nodeW / 2;
    const y1 = from.y + geom.nodeH;
    const x2 = to.x + geom.nodeW / 2;
    const y2 = to.y;
    // Control points pulled vertically by half the gap, so the line leaves the
    // node it comes from going down and arrives at the next one going down —
    // a curve that reads as a route rather than as a diagonal.
    const bend = Math.max(24, (y2 - y1) / 2);
    edges.push({
      id: `${fromId}-${kind}->${toId}`,
      from: fromId,
      to: toId,
      state: edgeState(byId.get(toId)),
      d: `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`,
      kind,
    });
  };

  for (const node of graph.nodes) {
    for (const id of parents.get(node.id) ?? []) join(id, node.id, 'requires');
    // Suggestions are drawn but were never ranked, so one can point upward or
    // sideways. The curve handles it; the layout above never saw it.
    for (const id of node.recommends ?? []) {
      if (byId.has(id)) join(id, node.id, 'recommends');
    }
  }

  const right = placed.reduce((max, entry) => Math.max(max, entry.x + geom.nodeW), 0);
  const bottom = placed.reduce((max, entry) => Math.max(max, entry.y + geom.nodeH), 0);

  /* The pieces, measured where they landed rather than where they were
     planned: `size` above is each piece's own extent before it was shelved,
     and what a renderer needs is the box on the finished canvas. Taken from
     the placed nodes, so it cannot disagree with them. */
  const regions: GraphRegion[] = pieces.map((members) => {
    const spots = members
      .map((id) => placed.find((entry) => entry.node.id === id))
      .filter((entry): entry is PlacedNode => Boolean(entry));
    const xs = spots.map((entry) => entry.x);
    const ys = spots.map((entry) => entry.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      ids: members,
      x,
      y,
      width: Math.max(...xs) + geom.nodeW - x,
      height: Math.max(...ys) + geom.nodeH - y,
    };
  });

  return { nodes: placed, edges, width: right + geom.pad, height: bottom + geom.pad, regions };
}

// ---------------------------------------------------------------------------
// Filtering and counting
// ---------------------------------------------------------------------------
export interface GraphFilter {
  /** Matched against name, category and blurb. */
  query: string;
  /** '' for every category. */
  category: string;
  /** null for every difficulty. */
  difficulty: Difficulty | null;
  /** Empty for every status. */
  statuses: NodeStatus[];
}

export const NO_FILTER: GraphFilter = {
  query: '',
  category: '',
  difficulty: null,
  statuses: [],
};

export function filterActive(filter: GraphFilter): boolean {
  return Boolean(
    filter.query.trim() || filter.category || filter.difficulty || filter.statuses.length,
  );
}

/**
 * The graph with the nodes that do not match taken out.
 *
 * A node that survives keeps its `requires`, and `layoutGraph` drops the ones
 * pointing at nodes that did not — so filtering to "Completed" draws the
 * completed nodes and the paths *between* them, rather than a set of orphans
 * with lines running off the edge of the canvas.
 */
export function filterGraph(graph: SkillGraph, filter: GraphFilter): SkillGraph {
  if (!filterActive(filter)) return graph;
  const needle = filter.query.trim().toLowerCase();

  const nodes = graph.nodes.filter((node) => {
    if (filter.category && node.category !== filter.category) return false;
    if (filter.difficulty && node.difficulty !== filter.difficulty) return false;
    if (filter.statuses.length && !filter.statuses.includes(node.status)) return false;
    if (!needle) return true;
    return (
      node.name.toLowerCase().includes(needle) ||
      node.category.toLowerCase().includes(needle) ||
      node.blurb.toLowerCase().includes(needle)
    );
  });

  return { ...graph, nodes };
}

/**
 * The graph with only these nodes on it.
 *
 * The same one rule `filterGraph` documents above: a survivor keeps its
 * `requires` untouched and `layoutGraph` drops the edges pointing at nodes
 * that did not survive, so a narrowed graph draws the paths *between* what is
 * left rather than a set of orphans with lines running off the canvas.
 *
 * Which ids is somebody else's judgement — this file has no idea what a route
 * or a frontier is. See `pathOf` in skills/route for the one that matters
 * today.
 */
export function keepOnly(graph: SkillGraph, ids: ReadonlySet<string>): SkillGraph {
  return { ...graph, nodes: graph.nodes.filter((node) => ids.has(node.id)) };
}

export interface GraphTally {
  total: number;
  complete: number;
  progress: number;
  available: number;
  locked: number;
  /** Complete as a share of every node, 0-100. */
  percent: number;
  /** XP on completed nodes. */
  xpEarned: number;
  /** XP on everything. */
  xpTotal: number;
}

export function tallyGraph(graph: SkillGraph): GraphTally {
  const count = (status: NodeStatus) =>
    graph.nodes.filter((node) => node.status === status).length;

  const total = graph.nodes.length;
  const complete = count('complete');

  return {
    total,
    complete,
    progress: count('progress'),
    available: count('available'),
    locked: count('locked'),
    percent: total > 0 ? (complete / total) * 100 : 0,
    xpEarned: graph.nodes
      .filter((node) => node.status === 'complete')
      .reduce((sum, node) => sum + node.xp, 0),
    xpTotal: graph.nodes.reduce((sum, node) => sum + node.xp, 0),
  };
}

/** The categories in use, most-populated first — what the toolbar offers. */
export function graphCategories(graph: SkillGraph): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    const name = node.category.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The nodes this one opens — the other half of `requires`, read backwards. */
export function unlockedBy(graph: SkillGraph, id: string): GraphNode[] {
  return graph.nodes.filter((node) => node.requires.includes(id));
}

/** The nodes this one waits on, in the order they were named. */
export function requirementsOf(graph: SkillGraph, node: GraphNode): GraphNode[] {
  const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]));
  return node.requires.map((id) => byId.get(id)).filter((entry): entry is GraphNode => Boolean(entry));
}
