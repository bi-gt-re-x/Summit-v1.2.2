/**
 * A reader's own programme for a node — the edited half of "How to improve".
 *
 * ## Why an override rather than a diff
 *
 * skills/improve derives a programme for every node from the domain, the tier
 * and the graph's edges. That derivation is allowed to change: a rung gets
 * reworded, a domain gains an override, a node moves a tier. A store that held
 * "step 3 was edited" would silently reattach that edit to whatever ended up
 * third, which is the kind of bug nobody reports because the result still looks
 * like a list of steps.
 *
 * So the first edit takes a copy. Once a node is in this store its programme is
 * the reader's outright and the ladder no longer touches it, and `clear` puts
 * it back to whatever the ladder says today. Two states, both explainable in a
 * sentence, and no third state where a list is half-derived.
 *
 * ## Where the completion figure comes from
 *
 * `at` is the step the reader is on, and it is the record here rather than
 * something read off the percentage. That inversion is the point: the whole
 * reason to edit a programme is that its length was wrong, and a length that
 * changes has to move the percentage rather than move the reader. Add a step
 * and you are the same distance along a longer list, so the figure falls;
 * delete one ahead of you and it rises. {@link applyProgress} does the division
 * — one place, so the bar, the tile and the band across the top cannot disagree
 * about it.
 *
 * ## Why the browser
 *
 * Same reasoning as utils/skillProgress, and the same precedent: there is no
 * table for it, the rules are not settled, and inventing a schema for a feature
 * this young is how you end up migrating one. User-scoped key, read and written
 * in exactly one file, so an endpoint later changes this module and nothing
 * above it. The reading and writing itself is utils/skillStore, which every
 * skill tree store shares.
 */
import { keepKnownNodes, treeRevision } from '@/skills/subjectTrees';
import { skillStore } from './skillStore';

/** One node's programme, as its reader left it. */
export interface StepPlan {
  /** Every step, in order. Never empty — the last one cannot be deleted. */
  steps: string[];
  /** Which of them is next, 0-based. Equals `steps.length` when all are done. */
  at: number;
}

/** Node id → the reader's own programme. Absent means "use the derived one". */
export type StepPlans = Record<string, StepPlan>;

/** How long one step is allowed to be. Long enough for a sentence, not a note. */
export const STEP_MAX = 160;

/** Above this the list has stopped being a programme and become a document. */
export const STEPS_MAX = 40;

/**
 * Trim an edited step to something that will render.
 *
 * Returns an empty string for anything that is only whitespace, which is what
 * the caller treats as "the reader cleared the field" rather than saving a row
 * of nothing.
 */
export function cleanStep(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, STEP_MAX);
}

const stepsStore = skillStore<StepPlans>({
  key: 'skillTreeSteps',
  version: 1,
  empty: {},
  revision: treeRevision,
  migrate: (from, raw) => (from === 0 ? raw : undefined),
  validate: (raw) => {
    if (!raw || typeof raw !== 'object') return {};
    // Validated rather than trusted, the same as the progress store: this is a
    // file a person can edit by hand, and one bad entry should cost one node
    // rather than every programme they have ever written.
    const clean: StepPlans = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      const plan = value as Partial<StepPlan> | null;
      if (!plan || !Array.isArray(plan.steps)) continue;
      const steps = plan.steps
        .filter((step): step is string => typeof step === 'string')
        .map(cleanStep)
        .filter(Boolean)
        .slice(0, STEPS_MAX);
      if (steps.length === 0) continue;
      const at =
        typeof plan.at === 'number' && Number.isFinite(plan.at)
          ? Math.max(0, Math.min(steps.length, Math.floor(plan.at)))
          : 0;
      clean[id] = { steps, at };
    }
    return clean;
  },
  onRevision: keepKnownNodes,
});

export function loadSteps(username: string | null): StepPlans {
  return stepsStore.load(username);
}

export function saveSteps(username: string | null, plans: StepPlans): void {
  stepsStore.save(username, plans);
}

/**
 * What percentage of a programme is behind the reader.
 *
 * The one place the division happens, so nothing has its own opinion of it.
 * An empty list is 0 rather than a division by zero — `loadSteps` will not
 * produce one, but a caller holding a list mid-edit can.
 */
export function planPercent(plan: StepPlan): number {
  if (plan.steps.length === 0) return 0;
  return Math.round((Math.min(plan.at, plan.steps.length) / plan.steps.length) * 100);
}

/**
 * The plan with one step's text replaced.
 *
 * Clearing a step to nothing deletes it, because a blank row in a numbered list
 * is a step you cannot do — but never the last one, so a programme can always
 * be got back to by editing rather than only by resetting.
 */
export function editStep(plan: StepPlan, index: number, text: string): StepPlan {
  const clean = cleanStep(text);
  if (!clean) return plan.steps.length > 1 ? removeStep(plan, index) : plan;
  const steps = plan.steps.map((step, at) => (at === index ? clean : step));
  return { ...plan, steps };
}

/**
 * The plan with a step added after `index`, or at the end when it is absent.
 *
 * `at` moves with the reader rather than with the list: a step inserted behind
 * them leaves them on the same step, one number further down. What changes is
 * the denominator, which is the whole point of being able to add one.
 */
export function addStep(plan: StepPlan, text: string, index?: number): StepPlan {
  const clean = cleanStep(text);
  if (!clean || plan.steps.length >= STEPS_MAX) return plan;
  const to = index === undefined ? plan.steps.length : Math.max(0, Math.min(plan.steps.length, index + 1));
  const steps = [...plan.steps.slice(0, to), clean, ...plan.steps.slice(to)];
  return { steps, at: to <= plan.at ? plan.at + 1 : plan.at };
}

/**
 * The plan with one step removed.
 *
 * The last step is kept: a programme of nothing has no completion figure to
 * report and no row left to edit your way out of. Removing a step the reader
 * has already passed moves them back a number so they stay on the same step;
 * removing one ahead of them leaves them where they are and shortens the list,
 * which is how deleting can put the figure up.
 */
export function removeStep(plan: StepPlan, index: number): StepPlan {
  if (plan.steps.length <= 1 || index < 0 || index >= plan.steps.length) return plan;
  const steps = plan.steps.filter((_, at) => at !== index);
  return { steps, at: Math.min(steps.length, index < plan.at ? plan.at - 1 : plan.at) };
}
