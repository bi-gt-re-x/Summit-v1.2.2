/**
 * The hall of fame's arithmetic.
 *
 * Every figure on the Records page is a reading of the same rows, and the
 * reading turns on one word: `comparison_direction`. A record measured
 * downward has to come out right in all of it — the best, the improvement, the
 * headline, the tiles, which entry broke a record — and the failure mode if it
 * does not is not a crash. It is a page that reads confidently and is upside
 * down in one corner, which is exactly the bug the column was added to end.
 *
 * So most of what is here is the same assertion made twice, once each way. The
 * rest is the cases that produce a number out of nothing: a first entry with
 * nothing to improve on, a record logged once, a headline with no journey to
 * report.
 */
import { describe, expect, it } from 'vitest';
import {
  attempts,
  breakthroughs,
  byDay,
  changeText,
  daysUntil,
  durationText,
  insightOf,
  linksOf,
  milestoneProgress,
  progressText,
  signedText,
  directionOf,
  filterRows,
  formatOn,
  formatValue,
  gainText,
  headline,
  isBetter,
  milestoneGroups,
  moments,
  personalBests,
  stepText,
  stories,
  tally,
  trail,
} from './records';
import type { RecordRow } from '@/services/records';

let counter = 0;

function row(over: Partial<RecordRow> = {}): RecordRow {
  counter += 1;
  return {
    id: `r${counter}`,
    user_id: 'u',
    kind: 'record',
    name: 'AMC 8',
    category: 'Competitive Math',
    value: 0,
    target: 0,
    unit: 'points',
    comparison_direction: 'higher',
    note: '',
    achieved_on: '2026-01-01',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...over,
  };
}

/** The AMC 8 story the page's own documentation uses: 18 → 20 → 21 → 23 → 25. */
const amc = [
  row({ value: 18, achieved_on: '2026-03-02' }),
  row({ value: 20, achieved_on: '2026-04-14' }),
  row({ value: 21, achieved_on: '2026-05-28' }),
  row({ value: 23, achieved_on: '2026-07-31' }),
  row({ value: 25, achieved_on: '2026-09-12' }),
];

/** A mile time coming down, which is the same story measured the other way. */
const mile = [
  row({ name: 'Mile', category: 'Running', unit: 'minutes', comparison_direction: 'lower',
        value: 8, achieved_on: '2026-03-02' }),
  row({ name: 'Mile', category: 'Running', unit: 'minutes', comparison_direction: 'lower',
        value: 7, achieved_on: '2026-05-28' }),
  row({ name: 'Mile', category: 'Running', unit: 'minutes', comparison_direction: 'lower',
        value: 6, achieved_on: '2026-09-12' }),
];

const TODAY = new Date(2026, 8, 20); // 20 Sep 2026, eight days after the last AMC 8.

describe('isBetter', () => {
  it('is the larger figure going up and the smaller one going down', () => {
    expect(isBetter(25, 23, 'higher')).toBe(true);
    expect(isBetter(23, 25, 'higher')).toBe(false);
    expect(isBetter(6, 7, 'lower')).toBe(true);
    expect(isBetter(7, 6, 'lower')).toBe(false);
  });

  it('is strict, so re-logging the same figure is not an improvement', () => {
    expect(isBetter(25, 25, 'higher')).toBe(false);
    expect(isBetter(6, 6, 'lower')).toBe(false);
  });
});

describe('directionOf', () => {
  it('reads a row written before the column existed as higher', () => {
    expect(directionOf([row({ comparison_direction: null })])).toBe('higher');
  });

  it('takes the newest answer when entries of one record disagree', () => {
    // Oldest first, which is the order personalBests builds a history in.
    expect(
      directionOf([
        row({ comparison_direction: 'higher' }),
        row({ comparison_direction: 'lower' }),
      ]),
    ).toBe('lower');
  });

  it('looks past rows that never answered to one that did', () => {
    expect(
      directionOf([
        row({ comparison_direction: 'lower' }),
        row({ comparison_direction: null }),
      ]),
    ).toBe('lower');
  });

  it('is higher when nothing answered at all', () => {
    expect(directionOf([])).toBe('higher');
  });
});

describe('personalBests', () => {
  it('takes the largest entry going up', () => {
    const [best] = personalBests(amc, TODAY);
    expect(best!.value).toBe(25);
    expect(best!.first).toBe(18);
    expect(best!.gain).toBe(7);
    expect(best!.entries).toBe(5);
  });

  it('takes the smallest entry going down, and still calls the gain positive', () => {
    const [best] = personalBests(mile, TODAY);
    expect(best!.direction).toBe('lower');
    expect(best!.value).toBe(6);
    expect(best!.first).toBe(8);
    // 8 → 6 is an improvement of two minutes, not of minus two.
    expect(best!.gain).toBe(2);
    expect(best!.percent).toBe(25);
  });

  it('does not take the newest entry as the best after a bad day', () => {
    const [best] = personalBests([...amc, row({ value: 19, achieved_on: '2026-09-19' })], TODAY);
    expect(best!.value).toBe(25);
    expect(best!.on).toBe('2026-09-12');
  });

  it('draws NEW RECORD only when the newest entry is also the best', () => {
    expect(personalBests(amc, TODAY)[0]!.fresh).toBe(true);
    const slipped = [...amc, row({ value: 19, achieved_on: '2026-09-19' })];
    expect(personalBests(slipped, TODAY)[0]!.fresh).toBe(false);
  });

  it('does not call a single entry fresh — there was nothing to beat', () => {
    expect(personalBests([row({ value: 25, achieved_on: '2026-09-12' })], TODAY)[0]!.fresh)
      .toBe(false);
  });

  it('goes stale once the best is older than the window', () => {
    expect(personalBests(amc, new Date(2026, 11, 1))[0]!.fresh).toBe(false);
  });

  it('groups by name regardless of case, and leaves milestones out', () => {
    const bests = personalBests(
      [
        row({ name: 'AMC 8', value: 18, achieved_on: '2026-03-02' }),
        row({ name: 'amc 8', value: 25, achieved_on: '2026-09-12' }),
        row({ kind: 'milestone', name: 'First AIME solve', value: 0 }),
      ],
      TODAY,
    );
    expect(bests).toHaveLength(1);
    expect(bests[0]!.value).toBe(25);
  });

  it('reports no percent rather than dividing by a first entry of zero', () => {
    const bests = personalBests(
      [
        row({ name: 'Pull-ups', value: 0, achieved_on: '2026-03-02' }),
        row({ name: 'Pull-ups', value: 12, achieved_on: '2026-09-12' }),
      ],
      TODAY,
    );
    expect(bests[0]!.gain).toBe(12);
    expect(bests[0]!.percent).toBe(0);
  });
});

describe('gainText', () => {
  it('signs the improvement the way the record reads', () => {
    expect(gainText(personalBests(amc, TODAY)[0]!)).toBe('+7');
    expect(gainText(personalBests(mile, TODAY)[0]!)).toBe('−2m');
  });
});

describe('headline', () => {
  it('picks the record that came furthest as a share of where it started', () => {
    // +7 on 18 is 39%; +40,000 on 46,000 is 87%... but the other way round is
    // the case that matters: a huge raw gain that is a small share must lose.
    const project = [
      row({ name: 'Summit', category: 'Code', unit: 'lines', value: 80_000,
            achieved_on: '2026-03-02' }),
      row({ name: 'Summit', category: 'Code', unit: 'lines', value: 86_000,
            achieved_on: '2026-09-12' }),
    ];
    const lead = headline(personalBests([...amc, ...project], TODAY));
    expect(lead!.name).toBe('AMC 8'); // 39% beats 7.5%, though +7 loses to +6,000.
  });

  it('is null when nothing has moved', () => {
    expect(headline(personalBests([row({ value: 25, achieved_on: '2026-09-12' })], TODAY)))
      .toBeNull();
    const flat = [
      row({ name: 'Flat', value: 25, achieved_on: '2026-03-02' }),
      row({ name: 'Flat', value: 25, achieved_on: '2026-09-12' }),
    ];
    expect(headline(personalBests(flat, TODAY))).toBeNull();
  });

  it('can be a record that got faster', () => {
    expect(headline(personalBests(mile, TODAY))!.name).toBe('Mile');
  });
});

describe('trail', () => {
  it('is the whole series while it is short enough', () => {
    expect(trail(personalBests(amc, TODAY)[0]!)).toEqual(['18', '20', '21', '23', '25']);
  });

  it('elides the middle, so the start and the present both survive', () => {
    // One a month through 2026, so the chronological order is the order here.
    const many = Array.from({ length: 12 }, (_, i) =>
      row({ value: 10 + i, achieved_on: `2026-${`${i + 1}`.padStart(2, '0')}-05` }),
    );
    const steps = trail(personalBests(many, TODAY)[0]!, 6);
    expect(steps).toHaveLength(6);
    expect(steps[0]).toBe('10');
    expect(steps[1]).toBe('…');
    expect(steps[steps.length - 1]).toBe('21');
  });

  it('leaves out an entry with no date, which the chart cannot place either', () => {
    expect(trail(personalBests([...amc, row({ value: 30, achieved_on: '' })], TODAY)[0]!))
      .toEqual(['18', '20', '21', '23', '25']);
  });
});

describe('moments', () => {
  it('calls the first entry first and not a record', () => {
    const read = moments(personalBests(amc));
    const first = read.get(amc[0]!.id)!;
    expect(first.first).toBe(true);
    expect(first.broke).toBe(false);
    expect(first.step).toBe(0);
  });

  it('marks an entry that beat everything before it, with the step it took', () => {
    const read = moments(personalBests(amc));
    const last = read.get(amc[4]!.id)!;
    expect(last.broke).toBe(true);
    expect(stepText(last)).toBe('+2');
  });

  it('does not call an entry a record when an earlier one was better', () => {
    const slipped = row({ value: 19, achieved_on: '2026-09-19' });
    const read = moments(personalBests([...amc, slipped]));
    expect(read.get(slipped.id)!.broke).toBe(false);
    expect(stepText(read.get(slipped.id)!)).toBe('');
  });

  it('reads a faster time as the record it is', () => {
    const read = moments(personalBests(mile));
    const last = read.get(mile[2]!.id)!;
    expect(last.broke).toBe(true);
    expect(stepText(last)).toBe('−1m');
  });

  it('has nothing to say about an entry with no date', () => {
    expect(moments(personalBests([row({ value: 25, achieved_on: '' })])).size).toBe(0);
  });
});

describe('stories', () => {
  const told = (rows: RecordRow[]) =>
    Object.fromEntries(
      stories(personalBests(rows, TODAY), TODAY).map((story) => [story.key, story]),
    );

  it('finds the biggest single jump, which is not the whole journey', () => {
    // 18 → 20 → 21 → 23 → 25: the steps are +2, +1, +2, +2, so the biggest
    // jump is 2 while the record itself has travelled 7.
    expect(told(amc).leap!.figure).toBe('+2');
  });

  it('counts a run of beating yourself, and stops it at a bad day', () => {
    expect(told(amc).run!.figure).toBe('5');
    expect(told([...amc, row({ value: 19, achieved_on: '2026-09-19' })]).run!.figure).toBe('5');
    const stumble = [
      row({ name: 'X', value: 10, achieved_on: '2026-01-01' }),
      row({ name: 'X', value: 12, achieved_on: '2026-02-01' }),
      row({ name: 'X', value: 9, achieved_on: '2026-03-01' }),
      row({ name: 'X', value: 11, achieved_on: '2026-04-01' }),
    ];
    expect(told(stumble).run!.figure).toBe('2');
  });

  it('draws nothing rather than a zero when there is no story to tell', () => {
    const one = stories(
      personalBests([row({ value: 25, achieved_on: '2026-09-12' })], TODAY),
      TODAY,
    );
    expect(one.map((story) => story.key)).not.toContain('leap');
    expect(one.map((story) => story.key)).not.toContain('run');
  });

  it('counts only the bests set this calendar month', () => {
    expect(told(amc).month!.figure).toBe('1');
    expect(told(mile).month!.figure).toBe('1');
  });

  it('names the best that has stood longest, and ignores one logged once', () => {
    const standing = told([...amc, ...mile]).standing!;
    // Both peaked in September, so neither has stood a month — nothing yet.
    expect(standing).toBeUndefined();
  });

  it('measures how long a best has stood in whole months', () => {
    const old = [
      row({ name: 'MathCounts', value: 28, achieved_on: '2025-01-05' }),
      row({ name: 'MathCounts', value: 32, achieved_on: '2025-03-09' }),
    ];
    expect(told(old).standing!.figure).toBe('1y');
  });
});

describe('filterRows', () => {
  /* The bests are a second argument now rather than worked out inside, so that
     a keystroke in the search box does not regroup every row. Every call here
     goes through this, which is also the assertion that the two arguments
     describe the same account. */
  const sift = (rows: RecordRow[], options: Parameters<typeof filterRows>[2]) =>
    filterRows(rows, personalBests(rows), options);

  const mixed = [
    ...amc,
    row({ name: 'Mile', category: 'Running', value: 6, achieved_on: '2026-09-12' }),
    row({ kind: 'milestone', name: 'First AIME solve', category: 'Competitive Math',
          value: 0, achieved_on: '2026-06-01' }),
  ];

  it('searches the name, the category and the note', () => {
    expect(sift(mixed, { query: 'mile' })).toHaveLength(1);
    expect(sift(mixed, { query: 'running' })).toHaveLength(1);
    expect(sift([row({ note: 'slept properly for once' })], { query: 'slept' })).toHaveLength(1);
  });

  it('filters to one category, milestones included', () => {
    expect(sift(mixed, { category: 'Running' })).toHaveLength(1);
    expect(sift(mixed, { category: 'Competitive Math' })).toHaveLength(6);
  });

  it('orders newest first by default and oldest first on request', () => {
    expect(sift(amc, {})[0]!.value).toBe(25);
    expect(sift(amc, { sort: 'oldest' })[0]!.value).toBe(18);
  });

  it('orders by how far a record has come, not by how large it is', () => {
    const rows = [
      row({ name: 'Big', value: 400, achieved_on: '2026-09-01' }),
      ...amc,
    ];
    // "Big" was logged once at 400 and has gone nowhere; AMC 8 has gone +7.
    expect(sift(rows, { sort: 'improvement' })[0]!.name).toBe('AMC 8');
  });
});

describe('byDay', () => {
  it('collects everything that happened on one day under it', () => {
    const days = byDay([
      row({ name: 'A', achieved_on: '2026-09-12' }),
      row({ name: 'B', achieved_on: '2026-09-12' }),
      row({ name: 'C', achieved_on: '2026-08-31' }),
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]!.rows).toHaveLength(2);
    expect(days[1]!.on).toBe('2026-08-31');
  });

  it('leaves out what never happened', () => {
    expect(byDay([row({ achieved_on: '' })])).toEqual([]);
  });
});

describe('milestoneGroups', () => {
  const mile1 = row({ kind: 'milestone', name: 'First 25/25', category: 'Academic',
                      value: 0, achieved_on: '2026-09-12' });
  const mile2 = row({ kind: 'milestone', name: 'Qualified for AIME', category: 'Academic',
                      value: 0, achieved_on: '' });
  const alone = row({ kind: 'milestone', name: 'Reached RCM 9', category: 'Music', value: 0 });
  const loose = row({ kind: 'milestone', name: 'Ran a marathon', category: '', value: 0 });

  it('groups a category with more than one thing in it', () => {
    const { groups } = milestoneGroups([mile1, mile2, alone, loose]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('Academic');
    expect(groups[0]!.children).toHaveLength(2);
    expect(groups[0]!.reached).toBe(1);
  });

  it('leaves a category of one, and an uncategorised one, at the top level', () => {
    const { loose: flat } = milestoneGroups([mile1, mile2, alone, loose]);
    expect(flat.map((entry) => entry.name).sort()).toEqual(['Ran a marathon', 'Reached RCM 9']);
  });

  it('ignores records entirely', () => {
    const { groups, loose: flat } = milestoneGroups(amc);
    expect(groups).toEqual([]);
    expect(flat).toEqual([]);
  });
});

describe('tally', () => {
  it('counts entries rather than records, and does not count milestones twice', () => {
    const counts = tally([...amc, row({ kind: 'milestone', name: 'First 25/25', value: 0 })]);
    expect(counts.records).toBe(5);
    expect(counts.milestones).toBe(1);
    expect(counts.categories).toBe(1);
  });
});

describe('formatting', () => {
  it('prints minutes the way anybody would say them', () => {
    expect(formatValue(258, 'minutes')).toBe('4h 18m');
    expect(formatValue(45, 'minutes')).toBe('45m');
  });

  it('keeps the seconds on a time under an hour', () => {
    expect(formatValue(7.75, 'minutes')).toBe('7m 45s');
    expect(formatValue(0.5, 'minutes')).toBe('30s');
    expect(formatValue(60.5, 'minutes')).toBe('1h 1m');
  });

  it('prints a capped score as the fraction it is', () => {
    expect(formatValue(25, 'points', 25)).toBe('25 / 25');
  });

  it('drops the unit when it adds nothing beside a number', () => {
    expect(formatValue(25, 'points')).toBe('25');
    expect(formatValue(12, 'problems')).toBe('12 problems');
  });

  it('reads a bare day as a local one rather than a day early', () => {
    expect(formatOn('2026-09-12')).toContain('12');
    expect(formatOn('')).toBe('-');
  });
});

/** Monthly entries from Jan 1, for the gates that need calendar time. */
function monthly(values: number[], over: Partial<RecordRow> = {}): RecordRow[] {
  return values.map((value, i) =>
    row({ name: 'Rating', value, achieved_on: `2026-${String(i + 1).padStart(2, '0')}-01`, ...over }),
  );
}

describe('insightOf', () => {
  it('reads a steady climb as a new level, with time and rate', () => {
    const [best] = personalBests(amc, TODAY);
    const read = insightOf(best!);
    expect(read.standing).toBe('new-best');
    expect(read.daysToBest).toBe(194);
    expect(durationText(read.daysToBest!)).toBe('6 months');
    expect(read.ratePerMonth).toBeCloseTo(7 / (194 / 30.44), 5);
    expect(read.vsPrevious).toBe(2);
    expect(read.previousBest).toBe(23);
    expect(read.trend).toEqual({ word: 'improving', early: false, basis: 5 });
    // Five entries is not enough to compare two halves.
    expect(read.pace).toBeNull();
    expect(read.breakthroughs).toEqual([]);
  });

  it('reads a falling mile time as improving, not declining', () => {
    const [best] = personalBests(mile, TODAY);
    const read = insightOf(best!);
    expect(read.standing).toBe('new-best');
    expect(read.vsPrevious).toBe(1);
    expect(read.trend?.word).toBe('improving');
    expect(read.trend?.early).toBe(true);
    expect(read.ratePerMonth).toBeGreaterThan(0);
  });

  it('says nothing about trend or rate off two entries', () => {
    const [best] = personalBests(amc.slice(0, 2), TODAY);
    const read = insightOf(best!);
    expect(read.trend).toBeNull();
    expect(read.ratePerMonth).toBeNull();
    expect(read.pace).toBeNull();
  });

  it('calls a single entry a starting point with nothing measured', () => {
    const [best] = personalBests([row({ value: 18 })], TODAY);
    const read = insightOf(best!);
    expect(read.standing).toBe('start');
    expect(read.daysToBest).toBeNull();
    expect(read.vsPrevious).toBeNull();
  });

  it('says a perfect score when the ceiling is reached', () => {
    const rows = [row({ value: 20, target: 25, achieved_on: '2026-01-01' }),
                  row({ value: 25, target: 25, achieved_on: '2026-03-01' })];
    expect(insightOf(personalBests(rows, TODAY)[0]!).standing).toBe('perfect');
  });

  it('owns up when the latest fell short', () => {
    const rows = [row({ value: 18, achieved_on: '2026-01-01' }),
                  row({ value: 25, achieved_on: '2026-02-01' }),
                  row({ value: 22, achieved_on: '2026-03-01' })];
    const read = insightOf(personalBests(rows, TODAY)[0]!);
    expect(read.standing).toBe('below');
    expect(read.vsPrevious).toBe(-3);
    expect(read.vsPreviousBest).toBe(-3);
  });

  it('sees gains speeding up, and slowing down', () => {
    const fast = insightOf(personalBests(monthly([10, 11, 12, 13, 20, 30]), TODAY)[0]!);
    expect(fast.pace).toBe('accelerating');
    const slow = insightOf(personalBests(monthly([10, 20, 28, 30, 30.5, 31]), TODAY)[0]!);
    expect(slow.pace).toBe('slowing');
  });

  it('does not call a maxed-out score slowing', () => {
    const rows = monthly([15, 20, 25, 25, 25, 25], { target: 25 });
    expect(insightOf(personalBests(rows, TODAY)[0]!).pace).toBeNull();
  });

  it('calls a flat run steady', () => {
    const rows = monthly([20, 24, 25, 24, 25, 24]);
    expect(insightOf(personalBests(rows, TODAY)[0]!).trend?.word).toBe('steady');
  });
});

describe('breakthroughs', () => {
  it('finds the one big jump among small ones', () => {
    const rows = [row({ value: 18, achieved_on: '2026-01-01' }),
                  row({ value: 19, achieved_on: '2026-02-01' }),
                  row({ value: 25, achieved_on: '2026-03-01' })];
    const [best] = personalBests(rows, TODAY);
    const found = breakthroughs(best!);
    expect(found).toHaveLength(1);
    expect(found[0]!.jump).toBe(6);
    expect(found[0]!.id).toBe(rows[2]!.id);
  });

  it('does not crown a steady climb', () => {
    expect(breakthroughs(personalBests(amc, TODAY)[0]!)).toEqual([]);
  });

  it('does not crown a lone tiny best', () => {
    const rows = [row({ value: 20, achieved_on: '2026-01-01' }),
                  row({ value: 21, achieved_on: '2026-02-01' }),
                  row({ value: 20, achieved_on: '2026-03-01' })];
    expect(breakthroughs(personalBests(rows, TODAY)[0]!)).toEqual([]);
  });

  it('finds one in a time coming down', () => {
    const rows = [8.5, 8.4, 7.5, 7.45].map((value, i) =>
      row({ name: 'Mile', unit: 'minutes', comparison_direction: 'lower', value,
            achieved_on: `2026-0${i + 1}-01` }));
    const found = breakthroughs(personalBests(rows, TODAY)[0]!);
    expect(found.map((one) => one.id)).toEqual([rows[2]!.id]);
  });
});

describe('attempts', () => {
  it('counts change from the start toward better, both ways', () => {
    const rows = attempts(personalBests(mile, TODAY)[0]!);
    expect(rows.map((one) => one.change)).toEqual([0, 1, 2]);
    expect(rows.map((one) => one.vsBest)).toEqual([null, 1, 1]);
    expect(rows.map((one) => one.n)).toEqual([1, 2, 3]);
  });
});

describe('signedText', () => {
  it('signs toward better the way the direction reads', () => {
    expect(signedText(2, 'points', 'higher')).toBe('+2');
    expect(signedText(-3, 'points', 'higher')).toBe('−3');
    expect(signedText(1 / 3, 'minutes', 'lower')).toBe('−20s');
    expect(signedText(-0.5, 'minutes', 'lower')).toBe('+30s');
    expect(signedText(0, 'points', 'higher')).toBe('0');
  });
});

describe('changeText', () => {
  it('says faster and slower for times, signs for the rest', () => {
    expect(changeText(1 / 3, 'minutes', 'lower')).toBe('20s faster');
    expect(changeText(-0.2, 'minutes', 'lower')).toBe('12s slower');
    expect(changeText(2, 'points', 'higher')).toBe('+2');
  });
});

describe('durationText', () => {
  it('picks the unit a person would', () => {
    expect(durationText(0)).toBe('the same day');
    expect(durationText(10)).toBe('10 days');
    expect(durationText(21)).toBe('3 weeks');
    expect(durationText(400)).toBe('1 year 1 month');
  });
});

describe('milestone progress', () => {
  const milestone = (over: Partial<RecordRow>) =>
    row({ kind: 'milestone', name: 'Goal', value: 0, target: 0, unit: '', achieved_on: '', ...over });

  it('has none without a target', () => {
    expect(milestoneProgress(milestone({}), [])).toBeNull();
  });

  it('counts a typed figure up from zero', () => {
    const got = milestoneProgress(milestone({ value: 12, target: 20, unit: 'problems' }), []);
    expect(got?.percent).toBe(60);
    expect(got?.met).toBe(false);
    expect(progressText(got!)).toBe('12 of 20 problems');
  });

  it('reads a linked record in its own direction', () => {
    const bests = personalBests(mile, TODAY);
    const sub7 = milestoneProgress(milestone({ target: 6.5, progress_from: 'Mile' }), bests);
    expect(sub7?.met).toBe(true);
    expect(sub7?.percent).toBe(100);
    const sub5 = milestoneProgress(milestone({ target: 5, progress_from: 'mile' }), bests);
    expect(sub5?.current).toBe(6);
    expect(sub5?.percent).toBeCloseTo(66.67, 1);
    expect(sub5?.from?.name).toBe('Mile');
    expect(progressText(sub5!)).toBe('6m now, aiming for 5m');
  });

  it('reads links without trusting the column', () => {
    expect(linksOf({ links: '["AMC 8", ""]' })).toEqual(['AMC 8']);
    expect(linksOf({ links: 'not json' })).toEqual([]);
    expect(linksOf({ links: null })).toEqual([]);
  });

  it('counts days to a target date', () => {
    expect(daysUntil('2026-09-30', TODAY)).toBe(10);
    expect(daysUntil('2026-09-18', TODAY)).toBe(-2);
    expect(daysUntil('', TODAY)).toBeNull();
  });
});
