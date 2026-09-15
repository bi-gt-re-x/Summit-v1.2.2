/**
 * A reader's own name for a node, and the drawing that follows from it.
 *
 * ## The icon is stored, not recomputed
 *
 * `iconForName` is a pure function of the name and the icon set, so the icon
 * could be derived on every render instead of held here. It is held because the
 * icon set grows: a drawing added next month would silently repaint a node the
 * reader named and was happy with, and repainting somebody's tile is not a
 * thing a release should do quietly. Matching happens once, when they press
 * Save, and the answer is theirs from then on.
 *
 * A rename that matches nothing stores no icon at all rather than storing the
 * old one, which keeps the two cases distinguishable: `icon: undefined` means
 * "this name found no drawing", and the node keeps whatever the tree gave it.
 *
 * ## Ids are untouched
 *
 * Only `name` and `icon` are overridden. Prerequisites, unlocks and the whole
 * routing table are keyed by id, so renaming Refactoring cannot orphan the two
 * nodes that require it — which is exactly why skills/types argues that an id
 * must never be the display name.
 *
 * ## Why the browser
 *
 * Same store, same reasoning, same precedent as utils/skillProgress and
 * utils/skillSteps: no table, unsettled rules, one file that an endpoint would
 * later replace without anything above it noticing. The reading and writing is
 * utils/skillStore, shared with the other three.
 */
import { keepKnownNodes, treeRevision } from '@/skills/subjectTrees';
import type { SkillGraph } from './skillGraph';
import { skillStore } from './skillStore';

/** What a reader has said a node should be called. */
export interface NodeName {
  name: string;
  /** The drawing their name matched, where it matched one. */
  icon?: string;
}

/** Node id → the reader's own name for it. */
export type NodeNames = Record<string, NodeName>;

/** Long enough for the longest name in the library, short enough for a tile. */
export const NAME_MAX = 48;

/** Trim a typed name to something a tile can draw. Empty means "no name". */
export function cleanName(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

const namesStore = skillStore<NodeNames>({
  key: 'skillTreeNames',
  version: 1,
  empty: {},
  revision: treeRevision,
  migrate: (from, raw) => (from === 0 ? raw : undefined),
  validate: (raw) => {
    if (!raw || typeof raw !== 'object') return {};
    // Validated rather than trusted, the same as the other two stores: one bad
    // entry should cost one node's name rather than every name on the account.
    const clean: NodeNames = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      const entry = value as Partial<NodeName> | null;
      if (!entry || typeof entry.name !== 'string') continue;
      const name = cleanName(entry.name);
      if (!name) continue;
      clean[id] = typeof entry.icon === 'string' && entry.icon ? { name, icon: entry.icon } : { name };
    }
    return clean;
  },
  onRevision: keepKnownNodes,
});

export function loadNames(username: string | null): NodeNames {
  return namesStore.load(username);
}

export function saveNames(username: string | null, names: NodeNames): void {
  namesStore.save(username, names);
}

/**
 * The graph under the reader's own names.
 *
 * Applied after {@link applyProgress} rather than inside it, because the two
 * have nothing to say to each other: one decides how far along a node is and
 * the other what it is called, and a node's name has never affected its status.
 * Everything downstream — the tiles, the panel, the Unlocks and Related rows,
 * the advice in skills/improve, the search — reads the graph, so renaming here
 * renames it everywhere at once.
 */
export function applyNames(graph: SkillGraph, names: NodeNames): SkillGraph {
  if (Object.keys(names).length === 0) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const own = names[node.id];
      if (!own) return node;
      // No matched icon means the name found no drawing, and the node keeps the
      // one it was designed with. See the note at the top of skills/iconMatch.
      return { ...node, name: own.name, icon: own.icon ?? node.icon };
    }),
  };
}
