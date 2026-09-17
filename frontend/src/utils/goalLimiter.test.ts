/**
 * The limiter — the subject carrying most of a goal's shortfall.
 *
 * Two things are worth pinning here and they pull in opposite directions.
 *
 * The first is that the attribution is *true of the tasks underneath it*: the
 * sentence names a subject and a share, and both have to be arithmetic a reader
 * could redo by hand off the list. That is the same bargain every panel on the
 * analytics page makes.
 *
 * The second is that it **refuses** far more often than it fires. A page that
 * always names a culprit is a page whose culprits mean nothing, so most of the
 * cases below are about the floors — too small a pile, too even a spread, a tie
 * for the lead — and each of them expects `null` rather than a hedge.
 */
import { describe, expect, it } from 'vitest';
import { goalLimiter, goalLimiters } from './goalLimiter';
import type { Goal, Task } from '@/types';

function day(offset: number): string {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/** The kind of goal this was written for: a score, by a date, over subjects. */
function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-amc8',
    title: 'Get 24 on the AMC 8',
    status: 'active',
    measure: 'number',
    unit: 'points',
    target_number: 24,
    current_value: 12,
    progress: 50,
    subject_ids: 'geometry,algebra',
    priority: 5,
    start_date: day(-60),
    created_at: `${day(-60)}T09:00:00`,
    deadline: day(60),
    milestones: [],
    ...over,
  } as Goal;
}

/** A task pointed at the goal: its subject, and how it went. */
function task(
  id: string,
  subject: string,
  over: Partial<Task> = {},
): Task {
  return {
    id,
    title: 'Practice set',
    subject,
    goal_id: 'g-amc8',
    status: 'done',
    xp_value: 30,
    priority: 'medium',
    created_at: `${day(-10)}T09:00:00`,
    completed_at: `${day(-5)}T10:00:00`,
    ...over,
  } as Task;
}

/** Finished, and the reader said it went badly. */
const badly = (id: string, subject: string) => task(id, subject, { execution: 2 });
/** Finished, and it went well. Counts for nothing on the rated pile. */
const well = (id: string, subject: string) => task(id, subject, { execution: 5 });
/** Still open. The fallback pile. */
const open = (id: string, subject: string) =>
  task(id, subject, { status: 'todo', completed_at: undefined });

const nameOf = (id: string) => (id === 'geometry' ? 'Geometry' : id);

describe('what is holding a goal up', () => {
  it('names the subject carrying most of the work that went badly', () => {
    const tasks = [
      badly('a', 'geometry'), badly('b', 'geometry'), badly('c', 'geometry'),
      badly('d', 'algebra'), badly('e', 'algebra'),
    ];

    const row = goalLimiter(goal(), tasks, nameOf);

    expect(row).not.toBeNull();
    expect(row!.subjectName).toBe('Geometry');
    expect(row!.basis).toBe('rated');
    // Three of five, rounded to the nearest five so the "~" in front of it is
    // honest about the size of the pile.
    expect(row!.share).toBe(60);
    expect(row!.count).toBe(3);
    expect(row!.total).toBe(5);
  });

  it('states the count behind the share rather than the share alone', () => {
    const row = goalLimiter(
      goal(),
      [
        badly('a', 'geometry'), badly('b', 'geometry'), badly('c', 'geometry'),
        badly('d', 'algebra'), badly('e', 'algebra'),
      ],
      nameOf,
    );

    // The working, in words a reader can check against their own task list.
    expect(row!.because).toBe(
      '3 of the 5 tasks you rated as going badly on this goal are filed under Geometry.',
    );
  });

  it('falls back to what is still open when too little has been rated', () => {
    // Two rated tasks is not a pile with a majority in it. Four open ones are.
    const tasks = [
      badly('a', 'geometry'), badly('b', 'algebra'),
      open('c', 'geometry'), open('d', 'geometry'),
      open('e', 'geometry'), open('f', 'algebra'),
    ];

    const row = goalLimiter(goal(), tasks, nameOf);

    expect(row!.basis).toBe('open');
    expect(row!.share).toBe(75);
    expect(row!.because).toContain('3 of the 4 tasks still open against this goal');
  });

  it('ignores work that went well, because that is not a shortfall', () => {
    // Geometry leads the *finished* work by a mile and none of it went badly.
    // Algebra is what the reader is struggling with.
    const tasks = [
      well('a', 'geometry'), well('b', 'geometry'), well('c', 'geometry'),
      well('d', 'geometry'), well('e', 'geometry'),
      badly('f', 'algebra'), badly('g', 'algebra'), badly('h', 'algebra'),
      badly('i', 'algebra'),
    ];

    expect(goalLimiter(goal(), tasks, nameOf)!.subjectName).toBe('algebra');
  });

  it('says nothing when the pile is too small to have a majority', () => {
    // Three rated and three open. Neither clears the floor, and two out of
    // three is a coin landing twice rather than a finding.
    const tasks = [
      badly('a', 'geometry'), badly('b', 'geometry'), badly('c', 'algebra'),
    ];

    expect(goalLimiter(goal(), tasks, nameOf)).toBeNull();
  });

  it('says nothing when the work is spread evenly', () => {
    // Four subjects, one each. There is no limiter here, there is a spread,
    // and naming whichever sorted first would be the page inventing a culprit.
    const tasks = [
      badly('a', 'geometry'), badly('b', 'algebra'),
      badly('c', 'statistics'), badly('d', 'physics'),
    ];

    expect(goalLimiter(goal(), tasks, nameOf)).toBeNull();
  });

  it('says nothing when two subjects tie for the lead', () => {
    const tasks = [
      badly('a', 'geometry'), badly('b', 'geometry'),
      badly('c', 'algebra'), badly('d', 'algebra'),
    ];

    expect(goalLimiter(goal(), tasks, nameOf)).toBeNull();
  });

  it('says nothing about a goal that is already done', () => {
    const tasks = [
      badly('a', 'geometry'), badly('b', 'geometry'), badly('c', 'geometry'),
      badly('d', 'algebra'), badly('e', 'algebra'),
    ];

    expect(goalLimiter(goal({ status: 'completed' }), tasks, nameOf)).toBeNull();
  });

  it('leaves unrated work out rather than reading it as a low score', () => {
    // Four unrated geometry tasks and four badly-rated algebra ones. Absent is
    // not zero — see the field note in types/models.
    const tasks = [
      task('a', 'geometry'), task('b', 'geometry'),
      task('c', 'geometry'), task('d', 'geometry'),
      badly('e', 'algebra'), badly('f', 'algebra'),
      badly('g', 'algebra'), badly('h', 'algebra'),
    ];

    const row = goalLimiter(goal(), tasks, nameOf);
    expect(row!.subjectName).toBe('algebra');
    expect(row!.total).toBe(4);
  });
});

describe('the way in', () => {
  const tasks = [
    badly('a', 'geometry'), badly('b', 'geometry'), badly('c', 'geometry'),
    badly('d', 'algebra'), badly('e', 'algebra'),
  ];

  it('opens the lattice that teaches the subject it named', () => {
    const row = goalLimiter(goal(), tasks, nameOf)!;

    // Geometry is a node on the mathematics lattice rather than a tree of its
    // own — see SUBJECT_TARGETS in skills/subjectMap — and the link has to
    // carry the node or it lands the reader at the top of a tree the subject
    // is nowhere near.
    expect(row.treeHref).toBe('/skill-trees?subject=geometry&node=m.geometry');
    expect(row.subjectHref).toBe('/analytics/subject/geometry');
  });
});

describe('across every goal', () => {
  it('ranks by how concentrated each shortfall is, worst first', () => {
    const spread = goal({ id: 'g-2', title: 'Finish the course', subject_ids: 'coding' });
    const tasks = [
      // Four of five on the AMC 8 goal — 80%.
      badly('a', 'geometry'), badly('b', 'geometry'),
      badly('c', 'geometry'), badly('d', 'geometry'), badly('e', 'algebra'),
      // Three of five on the second — 60%.
      { ...badly('f', 'coding'), goal_id: 'g-2' },
      { ...badly('g', 'coding'), goal_id: 'g-2' },
      { ...badly('h', 'coding'), goal_id: 'g-2' },
      { ...badly('i', 'algebra'), goal_id: 'g-2' },
      { ...badly('j', 'statistics'), goal_id: 'g-2' },
    ];

    const rows = goalLimiters([goal(), spread], tasks, nameOf);

    expect(rows.map((row) => row.share)).toEqual([80, 60]);
    expect(rows[0]!.goalTitle).toBe('Get 24 on the AMC 8');
  });

  it('returns nothing at all on an account with no goals', () => {
    expect(goalLimiters([], [], nameOf)).toEqual([]);
  });
});
