/**
 * The sample of real work that goes up with the reading.
 *
 * What is pinned here is the handful of ways this could quietly send the
 * wrong thing: work from another subject, work that was never finished, work
 * from outside the window the panel is arguing about, or a half-answered
 * rating printed as though it were a score. Every one of those reaches the
 * model as a fact about the reader, and the model has no way to tell.
 */
import { describe, expect, it } from 'vitest';
import { SAMPLE, nameFamily, recentWork, workGroups } from './recentWork';
import type { AnalyticsTask } from '@/services/analytics';

const TODAY = '2026-09-05';

let seq = 0;

function did(over: Partial<AnalyticsTask> = {}): AnalyticsTask {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    status: 'done',
    priority: 'medium',
    subject: 'maths',
    xp_value: 30,
    created_at: TODAY,
    completed_at: TODAY,
    difficulty: 3,
    execution: 3,
    ...over,
  } as AnalyticsTask;
}

function ago(days: number): string {
  const at = new Date(`${TODAY}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

describe('what goes into the sample', () => {
  it('sends the title, which is the whole point of it', () => {
    /* Every other input to the reading is a measurement. This is the only
       one that says what the work actually is, and a step that cannot name
       the material is the generic advice the sample exists to end. */
    const rows = recentWork([did({ title: 'MATHCOUNTS Sprint 21-30' })], 'maths', '30d', TODAY);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('MATHCOUNTS Sprint 21-30');
  });

  it('carries how it went and how long it took beside the title', () => {
    const rows = recentWork(
      [did({ difficulty: 4, execution: 2, completion_seconds: 2700, reason: 'no-time' })],
      'maths',
      '30d',
      TODAY,
    );

    expect(rows[0]).toMatchObject({
      difficulty: 4,
      execution: 2,
      minutes: 45,
      reason: 'Ran out of time',
    });
  });

  it('sends the reader\'s own words for the reason, not the stored key', () => {
    /* `<mistake_patterns>` states these as labels. Two spellings of the same
       vocabulary in one brief is a model matching strings instead of reading
       a record. */
    const rows = recentWork([did({ reason: 'interrupted' })], 'maths', '30d', TODAY);

    expect(rows[0]!.reason).toBe('Kept getting interrupted');
  });

  it('leaves the reason empty when the question was never put', () => {
    /* Absent is the ordinary state — only accounts at rating_depth
       "reasons" are asked at all. */
    expect(recentWork([did()], 'maths', '30d', TODAY)[0]!.reason).toBe('');
  });

  it('leaves a half-answered rating off rather than printing half of it', () => {
    /* `qualityOf`'s rule, and it matters more here than anywhere: a brief
       that prints "difficulty 4, execution —" invites the model to read the
       blank as a bad result. Neither row goes. */
    const rows = recentWork([did({ difficulty: 4, execution: undefined })], 'maths', '30d', TODAY);

    expect(rows[0]!.difficulty).toBeNull();
    expect(rows[0]!.execution).toBeNull();
  });

  it('reports no minutes rather than nought when nothing was timed', () => {
    /* Nought minutes is a task finished instantly, which is a claim. Nothing
       recorded is the honest answer and the brief simply omits the field. */
    const rows = recentWork([did({ completion_seconds: 0 })], 'maths', '30d', TODAY);

    expect(rows[0]!.minutes).toBeNull();
  });
});

describe('what stays out of it', () => {
  it('takes only this subject', () => {
    const rows = recentWork(
      [did({ subject: 'maths' }), did({ subject: 'code' })],
      'maths',
      '30d',
      TODAY,
    );

    expect(rows).toHaveLength(1);
  });

  it('takes only finished work', () => {
    /* An unfinished task says nothing about how the work went, and a model
       handed one alongside forty results will read it as a result. */
    const rows = recentWork(
      [did(), did({ status: 'todo', completed_at: undefined }), did({ status: 'expired' })],
      'maths',
      '30d',
      TODAY,
    );

    expect(rows).toHaveLength(1);
  });

  it('keeps to the window the rest of the reading is arguing about', () => {
    /* The panel's figures are the window's. A sample reaching outside it
       would have the model quoting work that is not in any number on the
       page — the same rule that clears a saved reading when the span moves. */
    const rows = recentWork(
      [did({ completed_at: ago(3) }), did({ completed_at: ago(200) })],
      'maths',
      '30d',
      TODAY,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.on).toBe(ago(3));
  });
});

describe('how much of it there is', () => {
  it('sends the most recent, newest first, and stops at the cap', () => {
    /* "What should I do next" is a question about what is being done now, so
       the recent end is the end that answers it. */
    const tasks = Array.from({ length: SAMPLE + 15 }, (_unused, at) =>
      did({ completed_at: ago(at), title: `Day ${at}` }),
    );

    const rows = recentWork(tasks, 'maths', 'all', TODAY);

    expect(rows).toHaveLength(SAMPLE);
    expect(rows[0]!.title).toBe('Day 0');
    expect(rows[SAMPLE - 1]!.title).toBe(`Day ${SAMPLE - 1}`);
  });

  it('sends what there is when there is less than the cap', () => {
    expect(recentWork([did(), did()], 'maths', '30d', TODAY)).toHaveLength(2);
    expect(recentWork([], 'maths', '30d', TODAY)).toEqual([]);
  });
});

describe('names, folded into groups', () => {
  it('blanks the numbers so ranges of one set are one group', () => {
    expect(nameFamily('MATHCOUNTS Sprint 21-30')).toBe('MATHCOUNTS Sprint #');
    expect(nameFamily('MATHCOUNTS Sprint 1-10')).toBe('MATHCOUNTS Sprint #');
    expect(nameFamily('AMC10 2019 #14')).toBe('AMC10 #');
  });

  it('keeps a word with a letter in it, so AMC8 and AMC10 stay apart', () => {
    expect(nameFamily('AMC8 2020 #3')).not.toBe(nameFamily('AMC10 2020 #3'));
  });
});

describe('every finished task, grouped by name', () => {
  const groups = () =>
    workGroups(
      [
        did({ title: 'MATHCOUNTS Sprint 1-10', completed_at: ago(3), difficulty: 2, execution: 5, completion_seconds: 600 }),
        did({ title: 'MATHCOUNTS Sprint 21-30', completed_at: ago(1), difficulty: 2, execution: 4, completion_seconds: 1200 }),
        did({ title: 'MATHCOUNTS Sprint 11-20', completed_at: ago(2), difficulty: 2, execution: 5 }),
        did({ title: 'AMC10 2019 #14', completed_at: ago(2), difficulty: 4, execution: 1, reason: 'no-time' }),
        did({ title: 'AMC10 2018 #9', completed_at: ago(4), difficulty: 4, execution: 2, reason: 'no-time' }),
        did({ title: 'Chemistry notes', subject: 'chem', completed_at: ago(1) }),
        did({ title: 'MATHCOUNTS Sprint 31-40', status: 'todo', completed_at: undefined }),
        did({ title: 'MATHCOUNTS Sprint 41-50', completed_at: ago(200) }),
      ],
      'maths',
      '30d',
      TODAY,
    );

  it('folds the ranges together and puts the biggest group first', () => {
    const [sprint, amc] = groups();
    expect(sprint!.name).toBe('MATHCOUNTS Sprint #');
    expect(sprint!.count).toBe(3);
    expect(amc!.name).toBe('AMC10 #');
    expect(amc!.count).toBe(2);
  });

  it('leaves out other subjects, unfinished work and work outside the window', () => {
    const names = groups().map((group) => group.name);
    expect(names).toEqual(['MATHCOUNTS Sprint #', 'AMC10 #']);
    expect(groups()[0]!.examples).not.toContain('MATHCOUNTS Sprint 41-50');
  });

  it('lists the titles actually used, newest first, so the next range can be named', () => {
    expect(groups()[0]!.examples).toEqual([
      'MATHCOUNTS Sprint 21-30',
      'MATHCOUNTS Sprint 11-20',
      'MATHCOUNTS Sprint 1-10',
    ]);
  });

  it('says how hard, how well, how long and how it went', () => {
    const [sprint, amc] = groups();
    expect(sprint!.difficulty).toBe(2);
    expect(sprint!.execution).toBe(4.7);
    // Only the two timed tasks: 10 and 20 minutes.
    expect(sprint!.minutes).toBe(15);
    expect(sprint!.well).toBe(3);
    expect(amc!.badly).toBe(2);
    expect(amc!.minutes).toBeNull();
    expect(sprint!.last).toBe(ago(1));
    expect(amc!.reasons).toEqual(['Ran out of time ×2']);
  });
});

