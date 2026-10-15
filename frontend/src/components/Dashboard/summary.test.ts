/**
 * What the dashboard's cards count.
 *
 * Every function here is the fix for a card that used to lie, and the module's
 * comments say what each lie was. Those are the cases tested: the overdue task
 * that used to hide behind a tab nobody opened, the "XP Earned" that counted
 * the wrong cohort, the activity feed that would have invented timestamps for
 * the sixty completions that have none.
 *
 * Days are compared as strings throughout, so nothing here builds a Date for a
 * day key and nothing here can drift a timezone.
 */
import { describe, expect, it } from 'vitest';
import { task } from '@/test/factories';
import {
  bucketTasks,
  dayPlan,
  daySummary,
  isCalendarTask,
  priorityMeta,
  recentActivity,
  daysIntoWeek,
  typicalDay,
  weekBefore,
  weekSummary,
} from './summary';

const TODAY = '2026-07-30';
const MONDAY = '2026-07-27';
const SUNDAY = '2026-08-02';

describe('priorityMeta', () => {
  it('names and tones the three stored priorities', () => {
    expect(priorityMeta('high')).toEqual({ label: 'High', tone: 'high' });
    // 'medium' is written 'med' in the stylesheet and 'Medium' on the badge —
    // the one place the three spellings meet.
    expect(priorityMeta('medium')).toEqual({ label: 'Medium', tone: 'med' });
    expect(priorityMeta('low')).toEqual({ label: 'Low', tone: 'low' });
  });

  it('reads case-insensitively, because older rows are not all lowercase', () => {
    expect(priorityMeta('HIGH')).toEqual({ label: 'High', tone: 'high' });
  });

  it('falls back to Low rather than rendering an unstyled badge', () => {
    expect(priorityMeta('')).toEqual({ label: 'Low', tone: 'low' });
    expect(priorityMeta('urgent')).toEqual({ label: 'Low', tone: 'low' });
  });
});

describe('bucketTasks', () => {
  it('puts an overdue task on today, not out of sight', () => {
    // The bug the "on today's plate" reading exists to prevent: five overdue
    // tasks behind a tab nobody would think to open.
    const overdue = task({ due_date: '2026-07-02' });
    expect(bucketTasks([overdue], TODAY).today).toEqual([overdue]);
  });

  it('puts an undated task on today — nothing is holding it to a later day', () => {
    const undated = task({ due_date: undefined });
    expect(bucketTasks([undated], TODAY).today).toEqual([undated]);
  });

  it('counts a task due today as today, not upcoming', () => {
    const due = task({ due_date: TODAY });
    expect(bucketTasks([due], TODAY).today).toEqual([due]);
  });

  it('sends tomorrow to upcoming', () => {
    const tomorrow = task({ due_date: '2026-07-31' });
    const buckets = bucketTasks([tomorrow], TODAY);
    expect(buckets.upcoming).toEqual([tomorrow]);
    expect(buckets.today).toEqual([]);
  });

  it('reads the day out of a full timestamp', () => {
    const dated = task({ due_date: '2026-07-30T23:30:00' });
    expect(bucketTasks([dated], TODAY).today).toEqual([dated]);
  });

  it('files a completed task under completed whatever it was due', () => {
    const done = task({ status: 'done', due_date: '2026-12-01' });
    expect(bucketTasks([done], TODAY).completed).toEqual([done]);
  });

  it('gives an expired task no tab at all', () => {
    const expired = task({ status: 'expired' });
    const buckets = bucketTasks([expired], TODAY);
    expect([...buckets.today, ...buckets.upcoming, ...buckets.completed]).toEqual([]);
  });

  it('leads the open lists with undated tasks, then sorts by date', () => {
    const undated = task({ title: 'undated', due_date: undefined });
    const late = task({ title: 'late', due_date: '2026-07-29' });
    const early = task({ title: 'early', due_date: '2026-07-10' });

    expect(bucketTasks([late, early, undated], TODAY).today.map((t) => t.title)).toEqual([
      'undated',
      'early',
      'late',
    ]);
  });

  it('shows the most recent completion first', () => {
    const older = task({
      title: 'older',
      status: 'done',
      completed_at: '2026-07-28T10:00:00',
    });
    const newer = task({
      title: 'newer',
      status: 'done',
      completed_at: '2026-07-30T10:00:00',
    });

    expect(
      bucketTasks([older, newer], TODAY).completed.map((t) => t.title),
    ).toEqual(['newer', 'older']);
  });

  it('sinks unstamped completions below the stamped ones', () => {
    // Sixty of this account's finished tasks predate the completed_at column.
    // Sorting them as time zero keeps them together at the bottom instead of
    // jumbled through the ones that do have a time.
    const stamped = task({
      title: 'stamped',
      status: 'done',
      completed_at: '2026-07-28T10:00:00',
    });
    const unstamped = task({ title: 'unstamped', status: 'done' });

    expect(
      bucketTasks([unstamped, stamped], TODAY).completed.map((t) => t.title),
    ).toEqual(['stamped', 'unstamped']);
  });

  it('does not mutate the list it was given', () => {
    const list = [task({ due_date: '2026-07-29' }), task({ due_date: undefined })];
    const before = list.map((t) => t.id);
    bucketTasks(list, TODAY);
    expect(list.map((t) => t.id)).toEqual(before);
  });
});

describe('daySummary', () => {
  it('is about today, not the week', () => {
    // The card it replaced showed the week's four numbers under a heading
    // that said Today, identical to the card below it.
    const summary = daySummary(
      [
        task({ status: 'done', completed_at: `${TODAY}T09:00:00`, xp_value: 40 }),
        task({ status: 'done', completed_at: '2026-07-28T09:00:00', xp_value: 500 }),
        task({ due_date: TODAY }),
      ],
      TODAY,
    );

    expect(summary).toEqual({ total: 2, done: 1, xp: 40, percent: 50 });
  });

  it('reads 0% on a day nothing has been finished — which is the point', () => {
    expect(daySummary([task({ due_date: TODAY }), task()], TODAY)).toEqual({
      total: 2,
      done: 0,
      xp: 0,
      percent: 0,
    });
  });

  it('counts an overdue task into today, matching the Today tab', () => {
    expect(daySummary([task({ due_date: '2026-01-01' })], TODAY).total).toBe(1);
  });

  it('leaves a task due later out', () => {
    expect(daySummary([task({ due_date: '2026-12-01' })], TODAY).total).toBe(0);
  });

  it('ignores expired tasks in the total', () => {
    expect(daySummary([task({ status: 'expired', due_date: TODAY })], TODAY).total).toBe(
      0,
    );
  });

  it('reports 0% for an empty day rather than dividing by nothing', () => {
    expect(daySummary([], TODAY)).toEqual({ total: 0, done: 0, xp: 0, percent: 0 });
  });

  it('rounds the percentage', () => {
    const tasks = [
      task({ status: 'done', completed_at: `${TODAY}T09:00:00` }),
      task({ due_date: TODAY }),
      task({ due_date: TODAY }),
    ];
    expect(daySummary(tasks, TODAY).percent).toBe(33);
  });

  it('reads a missing xp_value as zero rather than as NaN', () => {
    const broken = task({
      status: 'done',
      completed_at: `${TODAY}T09:00:00`,
      xp_value: undefined as unknown as number,
    });
    expect(daySummary([broken], TODAY).xp).toBe(0);
  });
});

describe('weekSummary', () => {
  it('counts completions by when they were finished, not when they were due', () => {
    // The correction the module documents: a week with six completions worth
    // 241 XP used to read "Completed 1, XP Earned 72" because five of the six
    // were scheduled in earlier weeks.
    const finishedThisWeekDueEarlier = task({
      status: 'done',
      due_date: '2026-06-01',
      completed_at: '2026-07-29T14:00:00',
      xp_value: 169,
    });
    const finishedThisWeekDueThisWeek = task({
      status: 'done',
      due_date: '2026-07-30',
      completed_at: '2026-07-30T14:00:00',
      xp_value: 72,
    });

    expect(
      weekSummary([finishedThisWeekDueEarlier, finishedThisWeekDueThisWeek], MONDAY, SUNDAY),
    ).toMatchObject({ done: 2, xp: 241 });
  });

  it('leaves out a completion from a previous week', () => {
    const lastWeek = task({
      status: 'done',
      completed_at: '2026-07-26T23:00:00',
      xp_value: 100,
    });
    expect(weekSummary([lastWeek], MONDAY, SUNDAY)).toMatchObject({ done: 0, xp: 0 });
  });

  it('includes both ends of the week', () => {
    const monday = task({ status: 'done', completed_at: `${MONDAY}T00:01:00` });
    const sunday = task({ status: 'done', completed_at: `${SUNDAY}T23:59:00` });
    expect(weekSummary([monday, sunday], MONDAY, SUNDAY).done).toBe(2);
  });

  it('cannot place an unstamped completion, so does not count it', () => {
    const unstamped = task({ status: 'done', xp_value: 100 });
    expect(weekSummary([unstamped], MONDAY, SUNDAY)).toMatchObject({ done: 0, xp: 0 });
  });

  it('does not pull overdue or undated work into the week, unlike the day card', () => {
    // The day card counts these because an overdue task is genuinely today's
    // problem. Doing the same here would put every undated task in the account
    // into a total that claims to describe one week.
    const overdue = task({ due_date: '2026-05-01' });
    const undated = task({ due_date: undefined });
    expect(weekSummary([overdue, undated], MONDAY, SUNDAY).total).toBe(0);
    expect(daySummary([overdue, undated], TODAY).total).toBe(2);
  });

  it('counts a task that is both due and done in the week once, as done', () => {
    const both = task({
      status: 'done',
      due_date: '2026-07-29',
      completed_at: '2026-07-29T12:00:00',
    });
    expect(weekSummary([both], MONDAY, SUNDAY)).toMatchObject({ total: 1, done: 1 });
  });

  it('rates the week against its own plate', () => {
    const tasks = [
      task({ status: 'done', completed_at: '2026-07-29T12:00:00' }),
      task({ due_date: '2026-07-31' }),
      task({ due_date: '2026-08-01' }),
      task({ due_date: '2026-08-02' }),
    ];
    expect(weekSummary(tasks, MONDAY, SUNDAY)).toMatchObject({
      total: 4,
      done: 1,
      rate: 25,
    });
  });

  it('reports 0 for an empty week rather than dividing by nothing', () => {
    expect(weekSummary([], MONDAY, SUNDAY)).toEqual({ total: 0, done: 0, rate: 0, xp: 0 });
  });
});


describe('recentActivity', () => {
  it('lists the most recent completions first', () => {
    const older = task({
      title: 'older',
      status: 'done',
      completed_at: '2026-07-28T10:00:00',
    });
    const newer = task({
      title: 'newer',
      status: 'done',
      completed_at: '2026-07-30T10:00:00',
    });

    expect(recentActivity([older, newer]).map((entry) => entry.title)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('leaves out completions with no timestamp rather than inventing one', () => {
    // Sixty of this account's ninety-nine finished tasks have no stamp. A feed
    // whose job is to say *when* cannot guess.
    const unstamped = task({ title: 'unstamped', status: 'done' });
    expect(recentActivity([unstamped])).toEqual([]);
  });

  it('leaves out a stamp that does not parse', () => {
    const broken = task({ status: 'done', completed_at: 'not a date' });
    expect(recentActivity([broken])).toEqual([]);
  });

  it('leaves out open tasks', () => {
    expect(recentActivity([task({ completed_at: '2026-07-30T10:00:00' })])).toEqual([]);
  });

  it('titles an untitled task rather than showing a blank row', () => {
    const untitled = task({
      title: '',
      status: 'done',
      completed_at: '2026-07-30T10:00:00',
    });
    expect(recentActivity([untitled])[0]!.title).toBe('Untitled');
  });

  it('returns three by default, and honours a larger limit', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      task({ status: 'done', completed_at: `2026-07-2${index}T10:00:00` }),
    );
    expect(recentActivity(many)).toHaveLength(3);
    expect(recentActivity(many, 6)).toHaveLength(6);
  });
});

describe('isCalendarTask', () => {
  it('needs both the flag and a date — either alone is not scheduled', () => {
    expect(isCalendarTask(task({ show_on_calendar: true, due_date: TODAY }))).toBe(true);
    expect(isCalendarTask(task({ show_on_calendar: true }))).toBe(false);
    expect(isCalendarTask(task({ due_date: TODAY }))).toBe(false);
  });

  it('accepts the 1 that SQLite stores for a boolean', () => {
    const stored = task({ show_on_calendar: 1 as unknown as boolean, due_date: TODAY });
    expect(isCalendarTask(stored)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// The day's shape
// --------------------------------------------------------------------------
/**
 * `dayPlan` is the adapter that lets the dashboard ask `utils/dayShape` the
 * questions a day poses. Two things about it are easy to get wrong and silent
 * when they are: which work counts as *timed*, and which counts as *left*.
 * They are deliberately different sets — a to-do nobody gave an hour to is
 * still on your plate.
 */
describe('dayPlan', () => {
  const TODAY = '2026-09-01';

  it('turns a timed task into a span, start to end', () => {
    const plan = dayPlan(
      [task({
        id: '1',
        status: 'todo',
        xp_value: 40,
        created_at: `${TODAY}T09:00:00`,
        due_date: `${TODAY}T11:30:00`,
        title: 'Physics',
      })],
      TODAY,
    );
    expect(plan.spans).toHaveLength(1);
    expect(plan.spans[0]).toMatchObject({ kind: 'task', start: 9, end: 11.5, title: 'Physics' });
  });

  it('gives a task with no length a nominal half hour', () => {
    /* Both ends on the same minute is a point, and a point is a span the merge
       in `dayShape` can never see. */
    const plan = dayPlan(
      [task({ id: '1', status: 'todo', created_at: `${TODAY}T14:00:00`, due_date: `${TODAY}T14:00:00` })],
      TODAY,
    );
    expect(plan.spans[0]).toMatchObject({ start: 13.5, end: 14 });
  });

  it('counts an undated task as left over without giving it a span', () => {
    const plan = dayPlan(
      [task({ id: '1', status: 'todo', due_date: '', xp_value: 30 })],
      TODAY,
    );
    expect(plan.spans).toEqual([]);
    expect(plan.left).toBe(1);
    expect(plan.xp).toBe(30);
  });

  it('leaves tomorrow’s work out of both', () => {
    const plan = dayPlan(
      [task({ id: '1', status: 'todo', due_date: '2026-09-02T09:00:00', xp_value: 30 })],
      TODAY,
    );
    expect(plan.spans).toEqual([]);
    expect(plan.left).toBe(0);
  });

  it('keeps an overdue task on today’s plate', () => {
    /* The same rule `daySummary` applies: work that is past its date has not
       stopped being work. It has no span on *today* though — its hour was
       yesterday's. */
    const plan = dayPlan(
      [task({ id: '1', status: 'todo', due_date: '2026-08-30T09:00:00', xp_value: 45 })],
      TODAY,
    );
    expect(plan.left).toBe(1);
    expect(plan.xp).toBe(45);
    expect(plan.spans).toEqual([]);
  });

  it('counts an overdue task at the XP finishing it still pays', () => {
    // Two days late keeps half (shared/rules.json `overdue`).
    const plan = dayPlan(
      [task({ id: '1', status: 'todo', due_date: '2026-10-18T09:00:00', xp_value: 40 })],
      '2026-10-20',
    );
    expect(plan.xp).toBe(20);
  });

  it('draws a finished task’s span but does not count it as left', () => {
    const plan = dayPlan(
      [task({
        id: '1',
        status: 'done',
        xp_value: 60,
        created_at: `${TODAY}T09:00:00`,
        due_date: `${TODAY}T10:00:00`,
        completed_at: `${TODAY}T10:00:00`,
      })],
      TODAY,
    );
    expect(plan.spans[0]).toMatchObject({ done: true, start: 9, end: 10 });
    expect(plan.left).toBe(0);
    expect(plan.xp).toBe(0);
  });

  it('puts the small hours at the end of the day, not the start', () => {
    /* The grid's day runs 6 AM to 5 AM, so 1 AM is hour 25 — otherwise a task
       at midnight would sort before breakfast and be "up next" all day. */
    const plan = dayPlan(
      [task({ id: '1', status: 'todo', created_at: `${TODAY}T00:30:00`, due_date: `${TODAY}T01:00:00` })],
      TODAY,
    );
    expect(plan.spans[0]).toMatchObject({ start: 24.5, end: 25 });
  });

  it('adds up everything still to be earned', () => {
    const plan = dayPlan(
      [
        task({ id: '1', status: 'todo', due_date: `${TODAY}T09:00:00`, xp_value: 30 }),
        task({ id: '2', status: 'todo', due_date: '', xp_value: 45 }),
        task({ id: '3', status: 'done', due_date: `${TODAY}T09:00:00`, completed_at: `${TODAY}T09:00:00`, xp_value: 90 }),
      ],
      TODAY,
    );
    expect(plan.left).toBe(2);
    expect(plan.xp).toBe(75);
  });
});

// --------------------------------------------------------------------------
// A usual day
// --------------------------------------------------------------------------
/**
 * The baseline the stat cards compare today against. Two of its rules are the
 * whole reason it is honest, and both are invisible when they break: empty
 * days count, and today does not.
 */
describe('typicalDay', () => {
  const TODAY = '2026-09-15';

  const done = (day: string, xp: number) =>
    task({ id: `${day}-${xp}`, status: 'done', completed_at: `${day}T18:00:00`, xp_value: xp });

  it('averages over the days lived, not the days worked', () => {
    /* Four tasks across two days, six days apart. A mean over "days you did
       something" would say two a day; the honest answer is what the stretch
       actually held. */
    const usual = typicalDay(
      [done('2026-09-08', 100), done('2026-09-08', 100), done('2026-09-14', 50), done('2026-09-14', 50)],
      TODAY,
    );
    expect(usual.days).toBe(7);
    expect(usual.tasks).toBeCloseTo(4 / 7);
    expect(usual.xp).toBeCloseTo(300 / 7);
  });

  it('leaves today out of its own baseline', () => {
    /* A day half-lived would otherwise drag the mean down and read as a slump
       at nine in the morning. */
    const usual = typicalDay([done('2026-09-14', 60), done(TODAY, 900)], TODAY);
    expect(usual.xp).toBeCloseTo(60);
  });

  it('ignores anything older than the window', () => {
    const usual = typicalDay([done('2026-08-01', 500), done('2026-09-14', 60)], TODAY);
    expect(usual.xp).toBeCloseTo(60);
  });

  it('says it has nothing rather than guessing, on a new account', () => {
    /* `days: 0` is what stops the card drawing "↑ ∞% vs usual" over a baseline
       of nothing. */
    expect(typicalDay([], TODAY)).toEqual({ tasks: 0, xp: 0, days: 0 });
    expect(typicalDay([task({ status: 'todo' })], TODAY).days).toBe(0);
  });

  it('measures a young account against its own history, not against zeroes', () => {
    /* Three days old, all of them worked: the answer is one a day, not
       three-fourteenths of one. */
    const usual = typicalDay(
      [done('2026-09-12', 30), done('2026-09-13', 30), done('2026-09-14', 30)],
      TODAY,
    );
    expect(usual.days).toBe(3);
    expect(usual.tasks).toBeCloseTo(1);
  });

  it('does not count an unfinished task toward a day’s work', () => {
    const usual = typicalDay(
      [done('2026-09-14', 60), task({ id: 'x', status: 'todo', due_date: '2026-09-14T09:00:00', xp_value: 500 })],
      TODAY,
    );
    expect(usual.xp).toBeCloseTo(60);
  });
});

// --------------------------------------------------------------------------
// The week before, to the same depth
// --------------------------------------------------------------------------
/**
 * The comparison that turns Weekly Overview from four figures into a card.
 * The trap it exists to avoid is the one the month view already hit: three
 * days of this week held against seven of last is not a fall in output, it is
 * a fall in *days*, and every figure would read as a collapse until Sunday.
 */
describe('weekBefore', () => {
  const MONDAY = '2026-09-07';

  const done = (day: string, xp = 30) =>
    task({ id: `${day}-${xp}-${Math.random()}`, status: 'done', completed_at: `${day}T18:00:00`, xp_value: xp });

  it('counts only as far into the previous week as this one has got', () => {
    /* Last week: Monday, Tuesday, and a Friday. Three days into this week, the
       Friday is not part of the comparison. */
    const tasks = [done('2026-08-31'), done('2026-09-01'), done('2026-09-04')];
    expect(weekBefore(tasks, MONDAY, 3).done).toBe(2);
  });

  it('counts the whole of it once the week is over', () => {
    const tasks = [done('2026-08-31'), done('2026-09-01'), done('2026-09-04')];
    expect(weekBefore(tasks, MONDAY, 7).done).toBe(3);
  });

  it('reaches back exactly seven days, not into the week before that', () => {
    expect(weekBefore([done('2026-08-24')], MONDAY, 7).done).toBe(0);
    expect(weekBefore([done('2026-08-31')], MONDAY, 7).done).toBe(1);
  });

  it('adds up the XP of the days it counts', () => {
    const tasks = [done('2026-08-31', 100), done('2026-09-06', 500)];
    expect(weekBefore(tasks, MONDAY, 1).xp).toBe(100);
  });
});

describe('daysIntoWeek', () => {
  it('counts from the week’s own Monday, inclusive', () => {
    expect(daysIntoWeek('2026-09-07', '2026-09-07')).toBe(1);
    expect(daysIntoWeek('2026-09-07', '2026-09-09')).toBe(3);
    expect(daysIntoWeek('2026-09-07', '2026-09-13')).toBe(7);
  });

  it('treats a week already behind you as a whole one', () => {
    /* And never more than one: a month-old week is still seven days, not
       thirty, or the comparison would reach back into other weeks. */
    expect(daysIntoWeek('2026-08-03', '2026-09-09')).toBe(7);
  });

  it('never returns less than a day', () => {
    expect(daysIntoWeek('2026-09-07', '2026-09-01')).toBe(1);
  });
});
