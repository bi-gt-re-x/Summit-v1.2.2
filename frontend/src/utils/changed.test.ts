/**
 * What changed — the two findings this module computes, and the order it draws.
 *
 * The three folded-in sources have their own suites: `whatsWorking` in
 * insight.test, `diagnose` in diagnosis.test, `discoverPatterns` in
 * patterns.test. What is only true here is the pair of rating-based rules and
 * the round-robin, so that is what this file pins.
 *
 * The round-robin matters more than it looks. Ranked on one scale, a good month
 * fills the section with gains and the emerging problem falls off the bottom —
 * which is exactly the card the reader did not come looking for and most needs.
 */
import { describe, expect, it } from 'vitest';
import { whatChanged, CHANGE_WINDOW, type Change } from './changed';
import type { Diagnosis } from './diagnosis';
import type { Win } from './insight';
import type { Pattern } from './patterns';
import type { GrowthDay, Task } from '@/types';

/** A day carrying whatever the rule under test reads. */
function day(over: Partial<GrowthDay> = {}): GrowthDay {
  return {
    date: '2026-01-01',
    day_number: 1,
    xp_earned: 100,
    tasks_completed: 2,
    cumulative_xp: 100,
    avg_task_xp: 50,
    focus_minutes: 60,
    cumulative_focus_minutes: 60,
    rated_tasks: 2,
    quality_score: 12,
    avg_difficulty: 3,
    avg_execution: 4,
    ...over,
  };
}

/** `count` days of the same shape. */
const run = (count: number, over: Partial<GrowthDay> = {}) =>
  Array.from({ length: count }, () => day(over));

function rated(difficulty: number, execution: number, id = '1'): Task {
  return {
    id,
    title: 'T',
    completed: true,
    difficulty,
    execution,
  } as unknown as Task;
}

const EMPTY = { wins: [] as Win[], diagnoses: [] as Diagnosis[], patterns: [] as Pattern[] };

const kinds = (changes: Change[]) => changes.map((change) => change.kind);
const ids = (changes: Change[]) => changes.map((change) => change.id);

describe('difficulty rising', () => {
  it('reports harder work when execution holds', () => {
    const days = [
      ...run(CHANGE_WINDOW, { avg_difficulty: 3.2, avg_execution: 4.3 }),
      ...run(CHANGE_WINDOW, { avg_difficulty: 3.8, avg_execution: 4.3 }),
    ];
    const [found] = whatChanged({ days, finished: [], ...EMPTY });
    expect(found?.kind).toBe('gain');
    expect(found?.move).toBe('3.2 → 3.8');
    expect(found?.text).toContain('86%');
  });

  it('refuses to call it getting stronger when execution collapsed', () => {
    /* The interesting negative. Difficulty is up by a fifth, which is the rule's
       trigger, and execution has fallen by more than a rounding — so this is not
       "getting stronger", whatever the first half of it looks like.

       It used to return nothing at all here, and that was the gap `qualityMoved`
       fills: a reader whose work got harder *and* went markedly worse was told
       neither thing, because the only rule watching execution was the one that
       needed it to hold. The gain is still refused; the collapse is now said
       out loud, which is the whole point of the section. */
    const days = [
      ...run(CHANGE_WINDOW, { avg_difficulty: 3.0, avg_execution: 4.4 }),
      ...run(CHANGE_WINDOW, { avg_difficulty: 3.6, avg_execution: 3.1 }),
    ];
    const found = whatChanged({ days, finished: [], ...EMPTY });
    expect(found.some((row) => row.id === 'change-difficulty-up')).toBe(false);

    const quality = found.find((row) => row.id === 'change-quality');
    expect(quality?.kind).toBe('problem');
    expect(quality?.move).toBe('4.4 → 3.1');
  });

  it('says nothing when difficulty barely moved', () => {
    const days = [
      ...run(CHANGE_WINDOW, { avg_difficulty: 3.4 }),
      ...run(CHANGE_WINDOW, { avg_difficulty: 3.5 }),
    ];
    expect(whatChanged({ days, finished: [], ...EMPTY })).toEqual([]);
  });

  it('says nothing when nothing was rated', () => {
    /* Every day carries a difficulty and none of them carries a rated task, so
       there is no denominator. A rule reading the column alone would average the
       zeros and report a change. */
    const days = [
      ...run(CHANGE_WINDOW, { rated_tasks: 0, avg_difficulty: 3.0 }),
      ...run(CHANGE_WINDOW, { rated_tasks: 0, avg_difficulty: 4.0 }),
    ];
    expect(whatChanged({ days, finished: [], ...EMPTY })).toEqual([]);
  });
});

describe('hard tasks failing', () => {
  const hardBad = (count: number) =>
    Array.from({ length: count }, (_, at) => rated(5, at < count / 2 ? 2 : 4, `h${at}`));
  const midGood = (count: number) =>
    Array.from({ length: count }, (_, at) => rated(3, 4, `m${at}`));

  it('compares the hard band with the middling one in points', () => {
    const finished = [...hardBad(10), ...midGood(10)];
    const [found] = whatChanged({ days: [], finished, ...EMPTY });
    expect(found?.kind).toBe('problem');
    // Half the hard tasks rated 2, none of the middling ones.
    expect(found?.text).toContain('50%');
    expect(found?.text).toContain('0%');
    expect(found?.basis).toContain('10 tasks rated 4 or 5');
  });

  it('refuses a band with too few tasks in it', () => {
    const finished = [...hardBad(4), ...midGood(20)];
    expect(whatChanged({ days: [], finished, ...EMPTY })).toEqual([]);
  });

  it('says nothing when both bands go equally well', () => {
    const finished = [
      ...Array.from({ length: 10 }, (_, at) => rated(5, 4, `h${at}`)),
      ...midGood(10),
    ];
    expect(whatChanged({ days: [], finished, ...EMPTY })).toEqual([]);
  });
});

describe('the order', () => {
  const win = (id: string): Win => ({ id, text: 'Your daily XP is up 20%', figure: '100 → 120', tone: 'violet' });
  const problem = (id: string, weight: number): Diagnosis => ({
    id,
    tone: 'warn' as Diagnosis['tone'],
    headline: 'Something is off.',
    detail: 'Two readings disagree.',
    action: 'Do a thing.',
    watch: 'Watch a thing.',
    weight,
  });
  const pattern = (id: string): Pattern => ({
    id,
    kind: 'timing',
    text: 'You rate your work 12% higher before 5pm.',
    basis: '20 tasks before 5pm, 18 after.',
    lift: 12,
    strength: 'likely',
    weight: 30,
  });

  it('draws one of each kind before a second of any', () => {
    const changes = whatChanged({
      days: [],
      finished: [],
      wins: [win('w1'), win('w2'), win('w3')],
      diagnoses: [problem('d1', 90)],
      patterns: [pattern('p1')],
    });
    expect(kinds(changes).slice(0, 3)).toEqual(['gain', 'problem', 'pattern']);
    // The three wins are not lost, they are just behind the other kinds.
    expect(kinds(changes)).toHaveLength(5);
  });

  it('keeps the strongest of each kind at the front of its lane', () => {
    const changes = whatChanged({
      days: [],
      finished: [],
      wins: [],
      diagnoses: [problem('quiet', 10), problem('loud', 99)],
      patterns: [],
    });
    expect(ids(changes)).toEqual(['change-loud', 'change-quiet']);
  });

  it('drops the instruction a diagnosis carries', () => {
    const [found] = whatChanged({
      days: [],
      finished: [],
      wins: [],
      diagnoses: [problem('d1', 50)],
      patterns: [],
    });
    expect(found?.text).toContain('Two readings disagree.');
    expect(found?.text).not.toContain('Do a thing');
  });

  it('is empty on an account with nothing to compare', () => {
    expect(whatChanged({ days: run(5), finished: [], ...EMPTY })).toEqual([]);
  });
});

/* --------------------------------------------------------------------------
   The five measures added after the section was found to be four views of the
   same XP. Each is pinned on the movement it claims, on the floor that stops
   it claiming one, and — where it can go either way — on the direction landing
   it in the right lane.
   -------------------------------------------------------------------------- */

const dated = (id: string, due: string, status = 'todo'): Task =>
  ({ id, title: 'T', status, due_date: due }) as unknown as Task;

describe('quality, as its own card', () => {
  it('names a rise in how well the work goes, out of five', () => {
    const days = [
      ...run(CHANGE_WINDOW, { avg_execution: 3.2 }),
      ...run(CHANGE_WINDOW, { avg_execution: 4.1 }),
    ];
    const found = whatChanged({ days, finished: [], ...EMPTY });
    const quality = found.find((row) => row.id === 'change-quality');
    expect(quality?.kind).toBe('gain');
    expect(quality?.move).toBe('3.2 → 4.1');
    // The reader answered on a five-point scale; the card says so.
    expect(quality?.text).toContain('out of 5');
  });

  it('says nothing on a movement inside the noise', () => {
    const days = [
      ...run(CHANGE_WINDOW, { avg_execution: 3.9 }),
      ...run(CHANGE_WINDOW, { avg_execution: 4.0 }),
    ];
    expect(whatChanged({ days, finished: [], ...EMPTY }).some((r) => r.id === 'change-quality'))
      .toBe(false);
  });

  it('refuses when too little was rated either side', () => {
    const days = [
      ...run(CHANGE_WINDOW, { avg_execution: 3.0, rated_tasks: 0 }),
      ...run(CHANGE_WINDOW, { avg_execution: 4.4, rated_tasks: 0 }),
    ];
    expect(whatChanged({ days, finished: [], ...EMPTY }).some((r) => r.id === 'change-quality'))
      .toBe(false);
  });
});

describe('efficiency, in the app’s own currency', () => {
  it('reads XP against the hours it took', () => {
    const days = [
      ...run(CHANGE_WINDOW, { xp_earned: 60, focus_minutes: 60 }),
      ...run(CHANGE_WINDOW, { xp_earned: 120, focus_minutes: 60 }),
    ];
    const found = whatChanged({ days, finished: [], ...EMPTY });
    const rate = found.find((row) => row.id === 'change-efficiency');
    expect(rate?.kind).toBe('gain');
    expect(rate?.move).toBe('60 → 120 XP/h');
  });

  it('calls a fall a problem rather than a gain', () => {
    const days = [
      ...run(CHANGE_WINDOW, { xp_earned: 150, focus_minutes: 60 }),
      ...run(CHANGE_WINDOW, { xp_earned: 60, focus_minutes: 60 }),
    ];
    const rate = whatChanged({ days, finished: [], ...EMPTY })
      .find((row) => row.id === 'change-efficiency');
    expect(rate?.kind).toBe('problem');
  });

  it('will not divide by an afternoon', () => {
    const days = [
      ...run(CHANGE_WINDOW, { xp_earned: 150, focus_minutes: 0 }),
      ...run(CHANGE_WINDOW, { xp_earned: 60, focus_minutes: 0 }),
    ];
    expect(whatChanged({ days, finished: [], ...EMPTY }).some((r) => r.id === 'change-efficiency'))
      .toBe(false);
  });
});

describe('subjects, by share rather than by total', () => {
  const days = run(CHANGE_WINDOW * 2);

  it('names the one that took a bigger share of the work', () => {
    const found = whatChanged({
      days, finished: [], ...EMPTY,
      subjects: [
        { key: 'math', name: 'Mathematics', now: 700, before: 200 },
        { key: 'cs', name: 'Computer Science', now: 300, before: 800 },
      ],
    });
    expect(found.find((row) => row.id === 'change-subject-math')?.kind).toBe('gain');
    expect(found.find((row) => row.id === 'change-subject-cs')?.kind).toBe('problem');
  });

  it('ignores a month where everything simply grew', () => {
    // Both doubled, so the balance is identical and nothing changed about what
    // this reader works on — which is the question the card asks.
    const found = whatChanged({
      days, finished: [], ...EMPTY,
      subjects: [
        { key: 'math', name: 'Mathematics', now: 400, before: 200 },
        { key: 'cs', name: 'Computer Science', now: 600, before: 300 },
      ],
    });
    expect(found.some((row) => row.id.startsWith('change-subject-'))).toBe(false);
  });
});

describe('what is sitting overdue', () => {
  const days = run(CHANGE_WINDOW * 2);

  it('counts unfinished dated work and how long the oldest has waited', () => {
    const found = whatChanged({
      days, finished: [], ...EMPTY, todayIso: '2026-03-10',
      open: [
        dated('a', '2026-03-01'),
        dated('b', '2026-03-05'),
        dated('c', '2026-03-09'),
      ],
    });
    const row = found.find((entry) => entry.id === 'change-overdue');
    expect(row?.kind).toBe('problem');
    expect(row?.text).toContain('3 tasks');
    expect(row?.text).toContain('9 days');
  });

  it('does not call finished work late', () => {
    const found = whatChanged({
      days, finished: [], ...EMPTY, todayIso: '2026-03-10',
      open: [
        dated('a', '2026-03-01', 'done'),
        dated('b', '2026-03-05', 'done'),
        dated('c', '2026-03-09', 'done'),
      ],
    });
    expect(found.some((row) => row.id === 'change-overdue')).toBe(false);
  });

  it('does not call an undated task late', () => {
    const found = whatChanged({
      days, finished: [], ...EMPTY, todayIso: '2026-03-10',
      open: [
        { id: 'a', title: 'T', status: 'todo' } as unknown as Task,
        { id: 'b', title: 'T', status: 'todo' } as unknown as Task,
        { id: 'c', title: 'T', status: 'todo' } as unknown as Task,
      ],
    });
    expect(found.some((row) => row.id === 'change-overdue')).toBe(false);
  });
});

describe('one card per measure', () => {
  it('draws one habit streak, not every habit that has one', () => {
    /* The bug this pins, as it appeared on a real account: "Gym: 267 weeks in
       a row" and "Lift: 267 weeks in a row", one above the other, two of the
       three cards the section had room for. */
    const streaks: Win[] = [
      { id: 'win-habit-Gym', text: 'Gym: 267 weeks in a row', figure: '100% consistent', tone: 'green' },
      { id: 'win-habit-Lift', text: 'Lift: 267 weeks in a row', figure: '100% consistent', tone: 'green' },
    ];
    const found = whatChanged({
      days: run(CHANGE_WINDOW * 2), finished: [], ...EMPTY, wins: streaks,
    });
    expect(found.filter((row) => row.family === 'habit-streak')).toHaveLength(1);
  });
});
