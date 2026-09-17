import { describe, expect, it } from 'vitest';
import {
  CONSISTENCY_FLOOR,
  RECORD_FLOOR,
  SUBJECT_FLOOR,
  WORKLOAD_FLOOR,
  whatSummitKnows,
  type KnowsInput,
} from './knows';

const base: KnowsInput = {
  finished: 40,
  activeDays: 10,
  spanDays: 90,
  windowDays: 30,
  subjects: [
    { name: 'Mathematics', count: 20 },
    { name: 'Computer Science', count: 12 },
    { name: 'History', count: 8 },
  ],
  recentTop: null,
};

const keys = (over: Partial<KnowsInput> = {}) =>
  whatSummitKnows({ ...base, ...over }).map((k) => k.key);

const textOf = (key: string, over: Partial<KnowsInput> = {}) =>
  whatSummitKnows({ ...base, ...over }).find((k) => k.key === key)?.text;

describe('workload', () => {
  it('averages against days worked, not days on the calendar', () => {
    expect(textOf('workload')).toBe('You average 4.0 tasks on the days you work.');
  });

  it('is not an average over a single day', () => {
    expect(keys({ activeDays: WORKLOAD_FLOOR - 1 })).not.toContain('workload');
  });

  it('stays quiet with nothing finished', () => {
    expect(keys({ finished: 0 })).not.toContain('workload');
  });
});

describe('consistency', () => {
  it('counts worked days against every day in the window', () => {
    expect(textOf('consistency')).toBe('You have worked on 10 of the last 30 days.');
  });

  it('needs a window worth describing', () => {
    expect(keys({ windowDays: CONSISTENCY_FLOOR - 1 })).not.toContain('consistency');
  });

  it('stays quiet on a record with no worked days', () => {
    expect(keys({ activeDays: 0 })).not.toContain('consistency');
  });
});

describe('the two day-count lines do not say the same thing twice', () => {
  it('drops consistency when the window covers the whole record', () => {
    /* "using Summit for 30 days, worked on 10" over "worked on 10 of the last
       30 days" is one sentence with two headings. */
    expect(keys({ spanDays: 30, windowDays: 30 })).not.toContain('consistency');
  });

  it('keeps it when the window is a shorter, more recent slice', () => {
    expect(keys({ spanDays: 90, windowDays: 30 })).toContain('consistency');
  });
});

describe('subjects', () => {
  it('states the leader as a share of the whole', () => {
    expect(textOf('subjects')).toBe('Mathematics is 50% of your recorded work.');
  });

  it('picks the leader by count, not by the order the rows arrive in', () => {
    /* `subjectXp` ranks by XP. Taking the first row while quoting a count
       share named the wrong subject and then made it look minor. */
    expect(
      textOf('subjects', {
        subjects: [
          { name: 'Chemistry', count: 3 },
          { name: 'Mathematics', count: 40 },
          { name: 'History', count: 7 },
        ],
      }),
    ).toBe('Mathematics is 80% of your recorded work.');
  });

  it('will not call the remainder bucket a subject', () => {
    expect(
      textOf('subjects', {
        subjects: [
          { name: 'Other', count: 60, lumped: true },
          { name: 'Mathematics', count: 30 },
          { name: 'History', count: 10 },
        ],
      }),
      // 30 of 100, because the remainder still counts toward the total.
    ).toBe('Mathematics is 30% of your recorded work.');
  });

  it('will not call one subject a hundred per cent of the work', () => {
    expect(keys({ subjects: [{ name: 'Mathematics', count: 20 }] })).not.toContain('subjects');
    expect(SUBJECT_FLOOR).toBe(2);
  });

  it('ignores subjects with nothing under them', () => {
    const found = whatSummitKnows({
      ...base,
      subjects: [
        { name: 'Mathematics', count: 20 },
        { name: 'Latin', count: 0 },
      ],
    });
    expect(found.find((k) => k.key === 'subjects')).toBeUndefined();
  });
});

describe('current focus', () => {
  it('appears when lately differs from all time', () => {
    expect(textOf('focus', { recentTop: 'Computer Science' })).toBe(
      'Lately you have been working on Computer Science most.',
    );
  });

  it('stays quiet when it would repeat the subjects line', () => {
    expect(keys({ recentTop: 'Mathematics' })).not.toContain('focus');
  });

  it('stays quiet when there is no recent answer', () => {
    expect(keys({ recentTop: null })).not.toContain('focus');
  });
});

describe('record', () => {
  it('says how long the account has been going and how much of it was worked', () => {
    expect(textOf('record')).toBe('You have been using Summit for 90 days, and worked on 10 of them.');
  });

  it('says so differently when no day was missed', () => {
    expect(textOf('record', { activeDays: 12, spanDays: 12 })).toBe(
      'You have worked on every one of your 12 days with Summit.',
    );
  });

  it('leads, because it is the length of the record the rest are rates of', () => {
    expect(keys()[0]).toBe('record');
  });

  it('stays quiet on a span nobody needs reminding of', () => {
    expect(keys({ spanDays: RECORD_FLOOR - 1 })).not.toContain('record');
  });

  it('stays quiet when nothing has been worked', () => {
    expect(keys({ activeDays: 0 })).not.toContain('record');
  });
});

describe('the section as a whole', () => {
  it('says nothing at all about a brand new account', () => {
    expect(
      whatSummitKnows({
        finished: 1,
        activeDays: 1,
        spanDays: 1,
        windowDays: 1,
        subjects: [{ name: 'Mathematics', count: 1 }],
        recentTop: null,
      }),
    ).toEqual([]);
  });

  it('gives every fact a heading and a sentence', () => {
    whatSummitKnows({ ...base, recentTop: 'History' }).forEach((fact) => {
      expect(fact.heading.length).toBeGreaterThan(0);
      expect(fact.text.endsWith('.')).toBe(true);
    });
  });
});
