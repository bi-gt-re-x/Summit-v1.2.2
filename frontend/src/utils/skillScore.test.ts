/**
 * A skill score has to be hard to fake and easy to check.
 *
 * The number is going to be read as a judgement — that is what a 0-100 with a
 * band name on it is — so the tests that matter are the ones about what it
 * refuses to say: that four good problems are not mastery, that a subject
 * abandoned three months ago does not hold its score, and that a subject
 * nobody rated gets no number rather than a bad one.
 */
import { describe, expect, it } from 'vitest';
import { bandFor, explainSkill, skillScores, SKILL_BANDS } from './skillScore';
import { skillAdvice } from './skillAdvice';
import type { Task } from '@/types';

const TODAY = new Date('2026-09-20T12:00:00');

const daysAgo = (days: number) =>
  new Date(TODAY.getTime() - days * 86_400_000).toISOString().slice(0, 10);

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: `t-${Math.random()}`,
    status: 'done',
    subject: 'geometry',
    xp_value: 10,
    completed_at: `${daysAgo(3)}T10:00:00`,
    ...over,
  }) as unknown as Task;

/** `count` rated tasks, spread over the last `spread` days. */
const run = (count: number, over: Partial<Task> = {}, spread = 60) =>
  Array.from({ length: count }, (_, i) =>
    task({ completed_at: `${daysAgo(Math.round((i / Math.max(1, count - 1)) * spread))}T10:00:00`, ...over }),
  );

const only = (rows: ReturnType<typeof skillScores>) => rows[0]!;

describe('the bands', () => {
  it('covers 0 to 100 with no gaps and no overlaps', () => {
    SKILL_BANDS.forEach((row, i) => {
      if (i > 0) expect(row.from).toBe(SKILL_BANDS[i - 1]!.to);
    });
    expect(SKILL_BANDS[0]!.from).toBe(0);
    expect(SKILL_BANDS[SKILL_BANDS.length - 1]!.to).toBe(100);
  });

  it('names the boundaries the way the spec does', () => {
    expect(bandFor(0)).toBe('Beginner');
    expect(bandFor(19)).toBe('Beginner');
    expect(bandFor(20)).toBe('Developing');
    expect(bandFor(40)).toBe('Competent');
    expect(bandFor(60)).toBe('Strong');
    expect(bandFor(75)).toBe('Advanced');
    expect(bandFor(90)).toBe('Mastery');
    expect(bandFor(100)).toBe('Mastery');
  });
});

describe('what the score refuses to do', () => {
  it('will not call four perfect problems mastery', () => {
    // The whole point of the confidence weighting. Four fives is a real run
    // and it is not evidence of mastery, and the number is read as though it
    // were.
    const row = only(skillScores(run(4, { difficulty: 5, execution: 5 }, 10), TODAY));

    expect(row.raw).toBeGreaterThan(70);
    expect(row.score).toBeLessThan(row.raw);
    expect(row.band).not.toBe('Mastery');
  });

  it('lets a long record stand on its own', () => {
    const few = only(skillScores(run(4, { difficulty: 5, execution: 5 }, 10), TODAY));
    const many = only(skillScores(run(60, { difficulty: 5, execution: 5 }, 60), TODAY));

    expect(many.score).toBeGreaterThan(few.score);
    // Past about thirty the pull is negligible: the score is the raw score.
    expect(Math.abs(many.score - many.raw)).toBeLessThanOrEqual(3);
    expect(many.confidence).toBeGreaterThan(0.85);
  });

  it('scores a subject nobody rated not at all, rather than badly', () => {
    // "You never said how it went" and "you are bad at this" are different
    // claims and only one of them is in the record.
    const rows = skillScores([task({ subject: 'music' }), task({ subject: 'music' })], TODAY);
    expect(rows).toEqual([]);
  });

  it('lets a score fall when the work stops', () => {
    const current = only(skillScores(run(20, { difficulty: 4, execution: 5 }, 30), TODAY));
    const abandoned = only(
      skillScores(
        Array.from({ length: 20 }, (_, i) =>
          task({ difficulty: 4, execution: 5, completed_at: `${daysAgo(200 + i)}T10:00:00` }),
        ),
        TODAY,
      ),
    );

    expect(abandoned.score).toBeLessThan(current.score);
    expect(abandoned.parts.retention).toBe(0);
  });

  it('ranks landing hard work above attempting it', () => {
    const lands = only(skillScores(run(20, { difficulty: 5, execution: 5 }), TODAY));
    const flounders = only(skillScores(run(20, { difficulty: 5, execution: 1 }), TODAY));

    expect(lands.parts.difficulty).toBeGreaterThan(flounders.parts.difficulty);
    expect(lands.score).toBeGreaterThan(flounders.score);
  });

  it('does not punish a subject for having no deadlines', () => {
    // Untracked is not late. Scoring it at zero would cost "no evidence" more
    // than "evidence of failure".
    const untracked = only(skillScores(run(20, { difficulty: 3, execution: 4 }), TODAY));
    const late = only(
      skillScores(run(20, { difficulty: 3, execution: 4, met_deadline: false }), TODAY),
    );

    expect(untracked.parts.execution).toBeGreaterThan(late.parts.execution);
    expect(late.parts.execution).toBe(0);
  });

  it('does not treat a gap as recent bad work', () => {
    // Nothing recent is what `retention` is for. Scoring `recent` at zero
    // would charge the same absence twice.
    const stale = only(
      skillScores(
        Array.from({ length: 12 }, (_, i) =>
          task({ difficulty: 4, execution: 5, completed_at: `${daysAgo(90 + i)}T10:00:00` }),
        ),
        TODAY,
      ),
    );
    expect(stale.parts.recent).toBeGreaterThan(50);
    expect(stale.trend).toBeNull();
  });
});

describe('the evidence behind the number', () => {
  it('finds the ceiling on the hard end', () => {
    const rows = skillScores(
      [
        ...run(9, { difficulty: 2, execution: 5 }),
        ...run(9, { difficulty: 5, execution: 2 }),
      ],
      TODAY,
    );
    const row = only(rows);

    expect(row.hardAccuracy).not.toBeNull();
    expect(row.hardAccuracy!).toBeLessThan(Math.round(row.parts.accuracy));
  });

  it('reports the direction of the last thirty days', () => {
    const rows = skillScores(
      [
        ...Array.from({ length: 8 }, () =>
          task({ difficulty: 3, execution: 2, completed_at: `${daysAgo(120)}T10:00:00` }),
        ),
        ...Array.from({ length: 8 }, () =>
          task({ difficulty: 3, execution: 5, completed_at: `${daysAgo(5)}T10:00:00` }),
        ),
      ],
      TODAY,
    );
    expect(only(rows).trend!).toBeGreaterThan(0);
  });

  it('separates the subjects', () => {
    const rows = skillScores(
      [
        ...run(20, { subject: 'geometry', difficulty: 4, execution: 5 }),
        ...run(20, { subject: 'algebra', difficulty: 2, execution: 2 }),
      ],
      TODAY,
    );
    expect(rows.map((row) => row.subject)).toEqual(['geometry', 'algebra']);
    expect(rows[0]!.score).toBeGreaterThan(rows[1]!.score);
  });
});

describe('why is it this number', () => {
  const nameOf = (id: string) => (id === 'geometry' ? 'Geometry' : id);

  it('names what is carrying it and what is limiting it', () => {
    const row = only(skillScores(run(20, { difficulty: 4, execution: 5 }), TODAY));
    const why = explainSkill(row, nameOf);

    expect(why.lifting).toContain('Geometry');
    expect(why.limiting).toBeTruthy();
    expect(why.evidence.map((item) => item.label)).toContain('Rated tasks');
    expect(why.evidence.find((item) => item.label === 'Rated tasks')!.value).toBe('20');
  });

  it('admits when the number is being held back by thin evidence', () => {
    const row = only(skillScores(run(3, { difficulty: 5, execution: 5 }, 5), TODAY));
    const why = explainSkill(row, nameOf);

    expect(why.caveat).toContain(String(row.raw));
    expect(why.caveat).toContain(String(row.score));
  });

  it('says nothing about confidence once there is enough of it', () => {
    const row = only(skillScores(run(60, { difficulty: 4, execution: 4 }), TODAY));
    expect(explainSkill(row, nameOf).caveat).toBeNull();
  });
});

describe('what the recommendations tab is handed', () => {
  const nameOf = (id: string) => (id === 'geometry' ? 'Geometry' : id);

  it('names a hard-end ceiling and carries no XP claim', () => {
    const rows = skillScores(
      [
        ...run(9, { difficulty: 2, execution: 5 }),
        ...run(9, { difficulty: 5, execution: 2 }),
      ],
      TODAY,
    );
    const advice = skillAdvice(rows, nameOf);
    const ceiling = advice.find((item) => item.id.startsWith('skill-ceiling:'));

    expect(ceiling?.title).toBe('Work the hard end of Geometry');
    // Every other rule on that tab is ranked by XP a year. "Attempt harder
    // problems" does not convert to one without inventing the conversion, so
    // it states none and sorts to the bottom.
    expect(ceiling?.impact).toBe(0);
    expect(ceiling?.category).toBe('Subjects');
  });

  it('asks for ratings where a record cannot be scored', () => {
    const rows = skillScores(
      [
        ...run(6, { difficulty: 3, execution: 4 }),
        ...run(20, { difficulty: undefined, execution: undefined }),
      ],
      TODAY,
    );
    const advice = skillAdvice(rows, nameOf);
    const unrated = advice.find((item) => item.id.startsWith('skill-unrated:'));

    expect(unrated?.title).toBe('Rate your Geometry work');
    expect(unrated?.evidence).toMatch(/6 of 26 finished tasks rated/);
  });

  it('says nothing about a subject that is rated and even', () => {
    const rows = skillScores(run(20, { difficulty: 3, execution: 4 }), TODAY);
    expect(skillAdvice(rows, nameOf)).toEqual([]);
  });
});
