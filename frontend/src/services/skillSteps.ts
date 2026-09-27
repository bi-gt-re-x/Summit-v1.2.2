/**
 * The written practice programmes, read from the server.
 *
 * These used to be computed here in the browser by skills/improve.ts, from a
 * ladder of twenty generic rungs sliced by tier. The note at the top of
 * data/sql/skillsteps.sql says why that had to stop; the short version is that
 * a ladder which has to fit Loops and Squat Depth cannot name anything
 * belonging to either, so every step came out as "Do ten from memory".
 *
 * They are written ahead of time now, checked, and stored — so this file is a
 * fetch and a cache, and holds no opinion about what a step should say.
 *
 * ## Why a whole tree at a time
 *
 * A reader opens a lattice and clicks tiles. Fetching per tile would put a
 * spinner inside a panel that is otherwise instant, on every click, for content
 * that never changes. So the page asks for every node on the tree the moment it
 * opens, one request, and the panel then renders from memory.
 *
 * ## The cache never expires
 *
 * Deliberately. This is the curriculum: the same rows for every reader, changed
 * only when somebody regenerates them with a script. There is no staleness
 * problem a reload does not solve, and a TTL here would buy nothing but a
 * second spinner. Keyed by node id rather than by tree, so two trees sharing a
 * node fetch it once.
 */
import { get } from './api';

/** One step, as the panel draws it. Mirrors backend/tracking/skillsteps.py. */
export interface WrittenStep {
  /** 1-based position in the programme. */
  ordinal: number;
  /** The step's own short name — "Factor Simple Quadratics". */
  title: string;
  /** What mastering this step means, in one sentence. */
  mastery: string;
  /** The one concrete thing to go and do. Drawn under a "Try:" label. */
  practice: string;
  /** How to actually do it. Shown when the step is opened. */
  detail: string;
  /** How the reader knows they got it right — usually the answer. */
  proof: string;
  /** The specific mistake people make here. */
  pitfall: string;
  /** Roughly what it costs. */
  minutes: number;
  /** What passed this step, and when. Every stored step carries one. */
  verified: {
    at: string;
    by: string;
    checks: string[];
    model: string;
    attempts: number;
  };
}

export type Programmes = Record<string, WrittenStep[]>;

interface StepsResponse {
  steps: Programmes;
  /** The ids asked for that have nothing written. */
  missing: string[];
}

/**
 * Node id → its programme, or `null` for "asked, and there is nothing".
 *
 * The null matters. Without it a node with no written steps is retried on every
 * click, because "absent from the cache" and "known to have none" look the same.
 */
const cache = new Map<string, WrittenStep[] | null>();

/** What the endpoint will accept in one request. Mirrors MAX_NODES there. */
const BATCH = 200;

/**
 * Fetch whatever is not cached, and answer for every id asked about.
 *
 * Nodes with nothing written come back absent from the result rather than as an
 * empty array, so a caller can tell "no programme" from "a programme of no
 * steps" — which is the same distinction the endpoint draws.
 */
export async function loadSteps(nodeIds: string[]): Promise<Programmes> {
  const wanted = [...new Set(nodeIds)].filter(Boolean);
  const missing = wanted.filter((id) => !cache.has(id));

  for (let at = 0; at < missing.length; at += BATCH) {
    const batch = missing.slice(at, at + BATCH);
    const result = await get<StepsResponse>('/api/skill-steps', { nodes: batch.join(',') });
    // A failure caches nothing: the panel falls back to its derived advice for
    // this render and tries again on the next open, which is the right
    // behaviour for a server that was briefly down.
    if (!result.success) continue;
    for (const id of batch) {
      cache.set(id, result.steps[id] ?? null);
    }
  }

  const out: Programmes = {};
  for (const id of wanted) {
    const steps = cache.get(id);
    if (steps && steps.length > 0) out[id] = steps;
  }
  return out;
}

/** What is already known about a node, without going to the network. */
export function cachedSteps(nodeId: string): WrittenStep[] | null {
  return cache.get(nodeId) ?? null;
}

/** Drop everything. Only for tests — nothing in the app invalidates this. */
export function clearStepCache(): void {
  cache.clear();
}
