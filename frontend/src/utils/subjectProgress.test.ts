/**
 * The rates on a subject's card, and the sentence above them.
 *
 * Each rate is pinned in the terms a reader would check it in — "of the tasks
 * I added this month, how many did I finish" — and each refuses to invent a
 * figure: no deadlines is no on-time rate, not 0%.
 */
import { describe, expect, it } from 'vitest';
import { subjectProgress, subjectVerdict } from './subjectProgress';
import { task } from '@/test/factories';
import type { Goal, Task } from '@/types';

const TO = '2026-09-30';
const TODAY = new Date('2026-09-30T12:00:00');

function t(over: Partial<Task>): Task {
  return task({ subject: 'math', ...over });
}

function read(tasks: Task[], goals: Goal[] = [], days: number | null = 30) {
  return subjectProgress({ subject: 'math', tasks, goals, days, toIso: TO, today: TODAY });
}

describe('the rates', () => {
  it('reads completion from what was added in the period', () => {
    const out = read([
      t({ created_at: '2026-09-10T09:00:00', status: 'done', completed_at: '2026-09-11T09:00:00' }),
      t({ created_at: '2026-09-12T09:00:00', status: 'done', completed_at: '2026-09-12T19:00:00' }),
      t({ created_at: '2026-09-20T09:00:00', status: 'todo' }),
      // Added before the period: not part of this period's plan.
      t({ created_at: '2026-07-01T09:00:00', status: 'todo' }),
      // Another subject entirely.
      t({ subject: 'art', created_at: '2026-09-20T09:00:00', status: 'todo' }),
    ]);
    expect(out.completion).toMatchObject({ num: 2, den: 3, rate: 67 });
  });

  it('counts went-well and hard among rated finished work only', () => {
    const out = read([
      t({ status: 'done', completed_at: '2026-09-15T10:00:00', execution: 5, difficulty: 4 }),
      t({ status: 'done', completed_at: '2026-09-16T10:00:00', execution: 2, difficulty: 2 }),
      // Finished but never rated: it says nothing about how it went.
      t({ status: 'done', completed_at: '2026-09-17T10:00:00' }),
    ]);
    expect(out.wentWell).toMatchObject({ num: 1, den: 2, rate: 50 });
    expect(out.hard).toMatchObject({ num: 1, den: 2, rate: 50 });
    expect(out.finished).toBe(3);
  });

  it('reads on-time from deadlines, and has no rate without any', () => {
    const out = read([
      t({ status: 'done', completed_at: '2026-09-15T10:00:00', due_date: '2026-09-16' }),
      t({ status: 'done', completed_at: '2026-09-20T10:00:00', due_date: '2026-09-18' }),
    ]);
    expect(out.onTime).toMatchObject({ num: 1, den: 2, rate: 50 });
    expect(read([t({ status: 'done', completed_at: '2026-09-15T10:00:00' })]).onTime.rate).toBeNull();
  });

  it('trusts the server’s deadline flag where it set one', () => {
    const out = read([
      t({ status: 'done', completed_at: '2026-09-20T10:00:00', due_date: '2026-09-18', met_deadline: true }),
    ]);
    expect(out.onTime.rate).toBe(100);
  });

  it('counts what is past due right now', () => {
    const out = read([
      t({ status: 'todo', due_date: '2026-09-25' }),
      t({ status: 'todo', due_date: '2026-10-05' }),
      t({ status: 'done', due_date: '2026-09-01', completed_at: '2026-09-01T10:00:00' }),
    ]);
    expect(out.overdue).toBe(1);
  });

  it('compares with the period of the same length before', () => {
    const out = read([
      t({ status: 'done', completed_at: '2026-08-20T10:00:00', execution: 2, difficulty: 3 }),
      t({ status: 'done', completed_at: '2026-09-20T10:00:00', execution: 5, difficulty: 3 }),
    ]);
    expect(out.wentWell.rate).toBe(100);
    expect(out.wentWell.before).toBe(0);
    // The whole record has nothing before it.
    expect(read([], [], null).wentWell.before).toBeNull();
  });
});

describe('goals', () => {
  const goal = (over: Partial<Goal>): Goal =>
    ({
      id: 'g1', title: 'Pass the exam', status: 'active', subject_ids: '', progress: 40,
      goal_type: 'tasks', target_tasks: 10, current_tasks: 4, created_at: '2026-09-01T00:00:00',
      start_date: '2026-09-01', deadline: '2026-12-01', milestones: [],
      ...over,
    }) as unknown as Goal;

  it('finds a goal that names the subject, or one a subject task counts toward', () => {
    const named = goal({ id: 'g1', subject_ids: 'math,physics' });
    const viaTask = goal({ id: 'g2', title: 'Ship it', subject_ids: '' });
    const unrelated = goal({ id: 'g3', title: 'Run', subject_ids: 'running' });
    const out = read([t({ goal_id: 'g2', status: 'todo' })], [named, viaTask, unrelated]);
    expect(out.goals.map((entry) => entry.goal.id).sort()).toEqual(['g1', 'g2']);
  });

  it('leaves out a finished goal', () => {
    const out = read([], [goal({ subject_ids: 'math', status: 'completed' })]);
    expect(out.goals).toEqual([]);
  });
});

describe('the sentence', () => {
  it('is built from the rates beside it', () => {
    const out = read([
      t({ created_at: '2026-09-10T09:00:00', status: 'done', completed_at: '2026-09-11T09:00:00', execution: 5, difficulty: 3 }),
      t({ created_at: '2026-09-12T09:00:00', status: 'todo', due_date: '2026-09-20' }),
    ]);
    expect(subjectVerdict(out, 'the last 30 days')).toBe(
      'You finished 1 of the 2 tasks you planned, and 100% of the rated work went well. 1 task is past due.',
    );
  });

  it('says so when nothing happened', () => {
    expect(subjectVerdict(read([]), 'the last 30 days')).toBe(
      'Nothing was planned or finished here in the last 30 days.',
    );
  });
});
