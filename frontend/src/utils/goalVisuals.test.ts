/**
 * Which chart a goal card draws, and the sentence saying why.
 *
 * Choosing per goal is the most opinionated thing the Goals page does: two
 * cards side by side deliberately show different charts, and to a reader who
 * is not told why, that reads as an inconsistency rather than a decision. The
 * line under the chart is what turns it back into one.
 *
 * It used to be `Chosen for a ${category} goal from what is recorded against
 * it` — true of every chart that category could have been given, and therefore
 * an explanation of nothing. It was also only a `title` attribute, so on a
 * phone it did not exist at all. The tests here are mostly about the property
 * that replaced it: the sentence names the evidence that actually made the
 * chart fit, so a reader who wants a different one can see what it would take
 * to get it.
 *
 * That property has a failure mode worth naming, because it is quiet: the
 * thresholds live in `FITS` and the sentences live in `WHY`, and nothing but
 * these tests makes one follow the other. A cap that moves without its
 * sentence is a page explaining itself with a rule it no longer uses.
 */
import { describe, expect, it } from 'vitest';
import { pickVisual, visualContext } from './goalVisuals';
import type { Goal, Task } from '@/types';

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Qualify for AIME',
    status: 'active',
    category: 'math',
    measure: 'milestones',
    subject_ids: 'algebra',
    start_date: '2026-07-01',
    created_at: '2026-07-01T09:00:00',
    deadline: '2026-12-01',
    milestones: [],
    ...over,
  } as unknown as Goal;
}

/** A finished task against the goal, with whatever evidence it carries. */
function done(over: Partial<Task> = {}): Task {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    title: 'Problem set',
    description: '',
    priority: 'low',
    status: 'done',
    xp_value: 20,
    goal_id: 'g-1',
    created_at: '2026-08-01T09:00:00',
    completed_at: '2026-08-02T10:00:00',
    ...over,
  } as unknown as Task;
}

/** `n` tasks rated for both difficulty and execution, spread over `levels`. */
const rated = (n: number, levels: number) =>
  Array.from({ length: n }, (_, at) =>
    done({ difficulty: (at % levels) + 1, execution: 3, completed_at: `2026-08-${String((at % 27) + 1).padStart(2, '0')}T10:00:00` }),
  );

const stone = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, title: `Stage ${id}`, status: 'todo', steps: [], ...over }) as never;

const pick = (one: Goal, tasks: Task[] = []) => pickVisual(visualContext(one, tasks));

describe('the sentence under the chart', () => {
  it('names the ratings behind an accuracy chart', () => {
    const chosen = pick(goal(), rated(9, 4));

    expect(chosen?.id).toBe('difficulty');
    expect(chosen?.why).toContain('9 finished tasks');
    expect(chosen?.why).toContain('4 difficulty levels');
  });

  it('names the target behind a distance chart', () => {
    const chosen = pick(goal({ measure: 'number', target_number: 24, unit: 'points' }));

    expect(chosen?.id).toBe('scale');
    expect(chosen?.why).toContain('24 points');
  });

  it('names the checkpoints behind a roadmap, and says why it is not a chart', () => {
    const chosen = pick(goal({ milestones: [stone('a'), stone('b'), stone('c')] }));

    expect(chosen?.id).toBe('roadmap');
    expect(chosen?.why).toContain('3 checkpoints');
    expect(chosen?.why).toMatch(/not yet enough finished work/);
  });

  it('names the days behind a consistency grid', () => {
    const chosen = pick(
      goal({ category: 'music' }),
      ['01', '02', '03', '04', '05'].map((at) => done({ completed_at: `2026-08-${at}T10:00:00` })),
    );

    expect(chosen?.id).toBe('heatmap');
    expect(chosen?.why).toContain('5 separate days');
  });

  it('names the subjects behind a by-subject split', () => {
    const chosen = pick(
      goal({ category: 'coding' }),
      [
        ...Array.from({ length: 3 }, () => done({ subject: 'algorithms' })),
        ...Array.from({ length: 3 }, () => done({ subject: 'systems' })),
      ],
    );

    expect(chosen?.id).toBe('skills');
    expect(chosen?.why).toContain('6 finished tasks');
    expect(chosen?.why).toContain('2 subjects');
  });
});

describe('what the sentence is for', () => {
  /* The regression. Both of these are maths goals, and the old sentence was
     built from the category, so both said "Chosen for a math goal from what is
     recorded against it" — over two visibly different charts. */
  it('differs when the chart differs, even for the same kind of goal', () => {
    const accuracy = pick(goal(), rated(9, 4));
    const plan = pick(goal({ milestones: [stone('a'), stone('b')] }));

    expect(accuracy?.id).not.toBe(plan?.id);
    expect(accuracy?.why).not.toBe(plan?.why);
  });

  /* The sentence has to describe the chart that was drawn. Naming evidence the
     goal does have, for a chart it did not get, is the one way this is worse
     than saying nothing. */
  it('describes the chart that was picked and not the one that nearly was', () => {
    // Enough ratings for `difficulty`, but a number goal takes `scale` first.
    const chosen = pick(goal({ measure: 'number', target_number: 24, unit: 'points' }), rated(9, 4));

    expect(chosen?.id).toBe('scale');
    expect(chosen?.why).not.toContain('difficulty levels');
  });

  it('counts only the work that is actually finished', () => {
    const chosen = pick(goal(), [
      ...rated(9, 4),
      ...Array.from({ length: 5 }, () => done({ status: 'todo', completed_at: undefined })),
    ]);

    // Nine, not fourteen: an open task is not evidence of anything yet.
    expect(chosen?.why).toContain('9 finished tasks');
  });

  it('has nothing to say about a goal with no checkpoints and no work', () => {
    expect(pick(goal())).toBeNull();
  });
});

/**
 * The thresholds and the sentences, checked against each other.
 *
 * `FITS` decides and `WHY` explains, and they are two tables that have to agree
 * about the same numbers. This is the test that notices when only one of them
 * is edited.
 */
describe('the sentence agrees with the rule that chose it', () => {
  it('draws the accuracy chart at six ratings and not at five', () => {
    expect(pick(goal(), rated(5, 3))?.id).not.toBe('difficulty');

    const at = pick(goal(), rated(6, 3));
    expect(at?.id).toBe('difficulty');
    expect(at?.why).toContain('6 finished tasks');
  });

  it('needs three difficulty levels, not two', () => {
    expect(pick(goal(), rated(9, 2))?.id).not.toBe('difficulty');
    expect(pick(goal(), rated(9, 3))?.id).toBe('difficulty');
  });

  it('draws the consistency grid at four days and not at three', () => {
    const days = (n: number) =>
      Array.from({ length: n }, (_, at) =>
        done({ completed_at: `2026-08-0${at + 1}T10:00:00` }),
      );

    expect(pick(goal({ category: 'music' }), days(3))?.id).not.toBe('heatmap');
    expect(pick(goal({ category: 'music' }), days(4))?.id).toBe('heatmap');
  });
});

describe('a chart the reader chose', () => {
  it('wins over the automatic pick, even with nothing behind it', () => {
    const chosen = pick(goal({ chart: 'heatmap', milestones: [stone('a')] }));

    expect(chosen?.id).toBe('heatmap');
    expect(chosen?.why).toMatch(/You chose this chart/);
  });

  it('draws charts the automatic pick never offers', () => {
    expect(pick(goal({ chart: 'step' }))?.id).toBe('step');
    expect(pick(goal({ chart: 'basic' }))?.id).toBe('basic');
  });

  it('falls back to the automatic pick for an empty or unknown choice', () => {
    const roadmap = { milestones: [stone('a'), stone('b')] };

    expect(pick(goal({ chart: '', ...roadmap }))?.id).toBe('roadmap');
    expect(pick(goal({ chart: 'pie', ...roadmap }))?.id).toBe('roadmap');
  });
});
