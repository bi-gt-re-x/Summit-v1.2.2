import { describe, expect, it } from 'vitest';
import {
  CONSISTENCY_FLOOR,
  HEAVY_LOAD,
  LIGHT_LOAD,
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

const adviceOf = (key: string, over: Partial<KnowsInput> = {}) =>
  whatSummitKnows({ ...base, ...over }).find((k) => k.key === key)?.advice ?? '';

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

  it('gives every fact something to do about it', () => {
    whatSummitKnows({ ...base, recentTop: 'History' }).forEach((fact) => {
      expect(fact.advice.endsWith('.')).toBe(true);
      /* Long enough to be a consequence and an instruction rather than a
         tacked-on imperative. The shortest real one runs to about eighty. */
      expect(fact.advice.length).toBeGreaterThan(40);
    });
  });
});

/*
 * The advice is chosen by the figure, not by the heading — that is the whole
 * claim the block makes, so what is worth pinning is that the *same* fact gives
 * opposite advice at opposite ends of its own range. The cases below assert the
 * turn, not the wording: each checks that two inputs on either side of a
 * threshold disagree, and names the shape it expects with one keyword.
 */
describe('the advice turns on the figure', () => {
  it('tells a heavy list to cut and a light one to add', () => {
    const heavy = adviceOf('workload', { activeDays: 10, finished: HEAVY_LOAD * 10 });
    const light = adviceOf('workload', { activeDays: 10, finished: (LIGHT_LOAD - 1) * 10 });
    expect(heavy).toMatch(/cut/i);
    expect(light).toMatch(/add/i);
    expect(heavy).not.toBe(light);
  });

  it('stops asking an unbroken record to be more consistent', () => {
    const held = adviceOf('record', { activeDays: 90, spanDays: 90 });
    const patchy = adviceOf('record', { activeDays: 30, spanDays: 90 });
    expect(held).toMatch(/not your problem/i);
    expect(patchy).toMatch(/60 days went by unworked/);
  });

  it('reads a dominant subject and a scattered week differently', () => {
    const dominant = adviceOf('subjects', {
      subjects: [
        { name: 'Mathematics', count: 80 },
        { name: 'History', count: 10 },
        { name: 'Computer Science', count: 10 },
      ],
    });
    const scattered = adviceOf('subjects', {
      subjects: [
        { name: 'Mathematics', count: 25 },
        { name: 'History', count: 25 },
        { name: 'Computer Science', count: 25 },
        { name: 'Violin', count: 25 },
      ],
    });
    expect(dominant).toMatch(/Over half/);
    expect(scattered).toMatch(/Nothing owns your time/);
  });

  it('does not call a deliberate pair of interests unfocused', () => {
    /* Two subjects at 50/50 is the scattered *share* without the scattered
       shape, and the third-subject guard is what keeps it off. */
    expect(
      adviceOf('subjects', {
        subjects: [
          { name: 'Mathematics', count: 50 },
          { name: 'History', count: 50 },
        ],
      }),
    ).toMatch(/Over half|clear lead/);
  });

  it('names both subjects when the focus has moved', () => {
    const moved = adviceOf('focus', { recentTop: 'Computer Science' });
    expect(moved).toContain('Mathematics');
    expect(moved).toContain('Computer Science');
  });

  it('leaves a clear lead alone', () => {
    /* 38%: ahead of the other two and nowhere near owning the account, which
       is the one band where the honest advice is to change nothing about the
       split. The base fixture sits exactly on DOMINANT_SHARE and is therefore
       the wrong account to ask. */
    const middle = adviceOf('subjects', {
      subjects: [
        { name: 'Mathematics', count: 15 },
        { name: 'History', count: 15 },
        { name: 'Computer Science', count: 10 },
      ],
    });
    expect(middle).toMatch(/clear lead/i);
    expect(middle).not.toMatch(/Over half|Nothing owns/);
  });
});
