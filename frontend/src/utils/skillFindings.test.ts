/**
 * Sentences that can be checked against the panel beside them.
 *
 * The failure worth guarding is not a missing finding — it is a finding that
 * fires on nothing, because the first time the page says "you have been
 * lacking on Geometry" about a subject with two rated tasks in it, the reader
 * stops believing the other five.
 */
import { describe, expect, it } from 'vitest';
import { skillFindings } from './skillFindings';
import { skillScores } from './skillScore';
import type { Task } from '@/types';

const TODAY = new Date('2026-09-20T12:00:00');
const daysAgo = (days: number) =>
  new Date(TODAY.getTime() - days * 86_400_000).toISOString().slice(0, 10);

const task = (over: Partial<Task> = {}): Task =>
  ({ id: `t-${Math.random()}`, status: 'done', subject: 'geometry', xp_value: 10,
     completed_at: `${daysAgo(3)}T10:00:00`, ...over }) as unknown as Task;

const nameOf = (id: string) => ({ geometry: 'Geometry', algebra: 'Algebra' })[id] ?? id;
const find = (tasks: Task[], limit = 6) =>
  skillFindings(skillScores(tasks, TODAY), nameOf, limit);

describe('what it says', () => {
  it('names a strong subject that has been left alone', () => {
    // The sentence the whole feature was asked for.
    const rows = find(
      Array.from({ length: 12 }, (_, i) =>
        task({ difficulty: 4, execution: 5, completed_at: `${daysAgo(20 + i)}T10:00:00` }),
      ),
    );
    const quiet = rows.find((row) => row.id.startsWith('quiet:'));
    expect(quiet?.text).toMatch(/lacking on Geometry/);
    expect(quiet?.text).toMatch(/\d+ days/);
  });

  it('names a ceiling on the hard end with both figures', () => {
    /* Worked in four of the last eight weeks, so `consistency` sits near the
       other parts and the lopsided rule — which outranks this one when it
       fires — does not. Several rules can fire on one subject and only the
       strongest is printed; that is the dedupe below, and it means a test for
       a particular rule has to build a record where it is the finding. */
    const weeks = [0, 2, 4, 6];
    const rows = find(
      weeks.flatMap((week) => [
        ...Array.from({ length: 3 }, () =>
          task({ difficulty: 2, execution: 5, completed_at: `${daysAgo(week * 7 + 1)}T10:00:00` })),
        ...Array.from({ length: 3 }, () =>
          task({ difficulty: 5, execution: 2, completed_at: `${daysAgo(week * 7 + 2)}T10:00:00` })),
      ]),
    );

    const ceiling = rows.find((row) => row.id.startsWith('ceiling:'));
    expect(ceiling?.text).toMatch(/holds up until the work gets hard/);
    // Both figures, so the sentence can be checked against the panel.
    expect(ceiling?.text).toMatch(/\d+% overall against \d+%/);
  });

  it('says when something is climbing', () => {
    const rows = find([
      ...Array.from({ length: 8 }, () =>
        task({ difficulty: 3, execution: 2, completed_at: `${daysAgo(120)}T10:00:00` })),
      ...Array.from({ length: 8 }, () =>
        task({ difficulty: 3, execution: 5, completed_at: `${daysAgo(4)}T10:00:00` })),
    ]);
    expect(rows.some((row) => /climbing/.test(row.text))).toBe(true);
  });
});

describe('what it refuses to say', () => {
  it('says nothing about a subject with almost no evidence', () => {
    // Two rated tasks is not a finding, however bad they were.
    expect(find([task({ difficulty: 5, execution: 1 }), task({ difficulty: 5, execution: 1 })]))
      .toEqual([]);
  });

  it('says nothing at all about an empty record', () => {
    expect(find([])).toEqual([]);
  });

  it('does not call a subject quiet when it was worked yesterday', () => {
    const rows = find(
      Array.from({ length: 12 }, () => task({ difficulty: 4, execution: 5, completed_at: `${daysAgo(1)}T10:00:00` })),
    );
    expect(rows.some((row) => row.id.startsWith('quiet:'))).toBe(false);
  });

  it('speaks about a subject once, however many rules fire on it', () => {
    // A slipping subject is usually also a lopsided one. Three sentences about
    // Geometry above a list of four findings is one finding and a stutter.
    const rows = find([
      ...Array.from({ length: 10 }, () =>
        task({ difficulty: 5, execution: 5, completed_at: `${daysAgo(150)}T10:00:00` })),
      ...Array.from({ length: 10 }, () =>
        task({ difficulty: 5, execution: 1, completed_at: `${daysAgo(40)}T10:00:00` })),
    ]);
    const subjects = rows.map((row) => row.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it('keeps to the limit it was given', () => {
    const many = ['geometry', 'algebra', 'calculus', 'statistics', 'physics'].flatMap((subject) =>
      Array.from({ length: 10 }, (_, i) =>
        task({ subject, difficulty: 4, execution: 5, completed_at: `${daysAgo(30 + i)}T10:00:00` })),
    );
    expect(find(many, 2)).toHaveLength(2);
  });
});
