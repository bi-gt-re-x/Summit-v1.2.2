import { describe, expect, it } from 'vitest';
import type { GrowthDay, Task } from '@/types';
import { periodSummary } from './periodSummary';

const TODAY = '2026-10-25';
const DAY_MS = 86_400_000;
const shift = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** A day series of `length` days ending today; `worked(back)` says which days had work. */
function series(length: number, worked: (back: number) => boolean, focus = 30): GrowthDay[] {
  return Array.from({ length }, (_, index) => {
    const back = length - 1 - index;
    const on = worked(back);
    return {
      date: shift(-back), day_number: index + 1, xp_earned: on ? 40 : 0, tasks_completed: on ? 2 : 0,
      cumulative_xp: 0, avg_task_xp: 0, focus_minutes: on ? focus : 0, cumulative_focus_minutes: 0,
      rated_tasks: 0, quality_score: 0, avg_difficulty: 0, avg_execution: 0,
    } as GrowthDay;
  });
}

let id = 0;
function task(back: number, subject: string, execution?: number, extra: Partial<Task> = {}): Task {
  id += 1;
  return {
    id: String(id), title: 't', priority: 'medium', status: 'done', xp_value: 20, subject,
    created_at: `${shift(-back)}T09:00:00`, completed_at: `${shift(-back)}T10:00:00`, execution, difficulty: 3, ...extra,
  } as Task;
}

const names: Record<string, string> = { mathematics: 'Mathematics', computer_science: 'Computer Science', music: 'Music' };
const nameOf = (key: string) => names[key] ?? key;
const line = (summary: ReturnType<typeof periodSummary>, group: string, label: string) =>
  summary.groups.find((entry) => entry.id === group)?.lines.find((entry) => entry.label === label);

describe('periodSummary', () => {
  // This week: worked 5 of 7 days. The week before: 3 of 7.
  const all = series(30, (back) => (back < 7 ? back !== 2 && back !== 3 : back < 14 ? back % 2 === 0 : true));
  const tasks = [
    // Math: rated better this week than last.
    ...[0, 1, 4].map((back) => task(back, 'mathematics', 4)),
    ...[8, 10, 12].map((back) => task(back, 'mathematics', 3)),
    // CS: new this week.
    task(5, 'computer_science', 3),
    // Music: three last week, none this week.
    ...[8, 9, 10].map((back) => task(back, 'music', 3)),
  ];

  it('counts days worked, the longest run and the longest break', () => {
    const summary = periodSummary(all, tasks, 'week', TODAY, nameOf);
    expect(summary.compared).toBe(true);
    expect(line(summary, 'consistency', 'Days worked')).toEqual({ label: 'Days worked', text: '5 of 7, up from 4.', tone: 'up' });
    expect(line(summary, 'consistency', 'Longest run')!.text).toBe('3 days in a row.');
    expect(line(summary, 'consistency', 'Longest break')!.text).toBe('2 days off in a row.');
  });

  it('says what changed, and only what moved enough', () => {
    const summary = periodSummary(all, tasks, 'week', TODAY, nameOf);
    expect(line(summary, 'changed', 'How it went')!.text).toBe('You rated your work 3.8 out of 5, up from 3.0.');
    expect(line(summary, 'changed', 'New')!.text).toBe('Picked up Computer Science.');
    expect(line(summary, 'changed', 'Dropped off')!.text).toBe('No Music this week.');
  });

  it('reads each subject as improving, new or steady', () => {
    const summary = periodSummary(all, tasks, 'week', TODAY, nameOf);
    expect(line(summary, 'subjects', 'Mathematics')).toEqual({
      label: 'Mathematics', text: 'Improving. 3 tasks, rated 3.0 → 4.0.', tone: 'up',
    });
    expect(line(summary, 'subjects', 'Computer Science')!.text).toBe('New. 1 task.');
  });

  it('adds up effort and focus time', () => {
    const summary = periodSummary(all, tasks, 'week', TODAY, nameOf);
    expect(line(summary, 'effort', 'Done')!.text).toBe('4 tasks and 200 XP, down 33% on the week before.');
    expect(line(summary, 'effort', 'Focus')!.text).toBe('2h 30m on the timer, up from 1h 30m.');
  });

  it("doesn't compare when the record doesn't reach back far enough", () => {
    const short = series(10, () => true);
    const summary = periodSummary(short, [task(0, 'mathematics', 4)], 'month', TODAY, nameOf);
    expect(summary.compared).toBe(false);
    expect(line(summary, 'consistency', 'Days worked')!.text).toBe('10 of 10.');
    expect(summary.groups.some((group) => group.id === 'changed')).toBe(false);
  });

  it('covers 30 and 365 days for month and year', () => {
    const long = series(800, (back) => back % 3 !== 0);
    expect(periodSummary(long, [], 'month', TODAY, nameOf).from).toBe(shift(-29));
    const year = periodSummary(long, [], 'year', TODAY, nameOf);
    expect(year.from).toBe(shift(-364));
    expect(line(year, 'consistency', 'Days worked')!.text).toBe('243 of 365, same as the year before.');
  });

  it('says plainly when nothing was done', () => {
    const quiet = series(20, (back) => back > 10);
    expect(periodSummary(quiet, [], 'week', TODAY, nameOf).empty).toBe(true);
  });

  it('writes no em dashes or curly quotes', () => {
    const summary = periodSummary(all, tasks, 'week', TODAY, nameOf);
    for (const group of summary.groups) {
      for (const entry of group.lines) expect(entry.text).not.toMatch(/[—“”]/);
    }
  });
});

describe('periodSummary days worked', () => {
  it('counts a day with a finished task even when the day series missed it', () => {
    const blank = series(20, () => false);
    const summary = periodSummary(blank, [task(0, 'mathematics', 4), task(1, 'mathematics', 4)], 'week', TODAY, nameOf);
    expect(line(summary, 'consistency', 'Days worked')!.text).toBe('2 of 7, up from 0.');
    expect(line(summary, 'consistency', 'Longest run')!.text).toBe('2 days in a row.');
  });
});
