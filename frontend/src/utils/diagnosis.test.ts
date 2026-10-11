import { describe, expect, it } from 'vitest';
import { diagnose, vitals } from './diagnosis';
import { outlookMilestones, xpForLevel, sooner } from './outlookMilestones';
import { levelForTotalXp } from './format';
import type { Goal, GrowthDay, Task } from '@/types';

/** Fourteen days from `start`, worked on the days `on` (0-based) with `xp` each. */
function fortnight(start: string, on: number[], xp = 100, focus = 60): GrowthDay[] {
  return Array.from({ length: 14 }, (_, at) => {
    const date = new Date(Date.parse(`${start}T00:00:00Z`) + at * 86_400_000).toISOString().slice(0, 10);
    const worked = on.includes(at);
    return {
      date,
      day_number: at + 1,
      xp_earned: worked ? xp : 0,
      tasks_completed: worked ? 2 : 0,
      cumulative_xp: 0,
      avg_task_xp: 0,
      focus_minutes: worked ? focus : 0,
      cumulative_focus_minutes: 0,
    } as unknown as GrowthDay;
  });
}

let seq = 0;
function done(subject: string, date: string, over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    status: 'done',
    subject,
    xp_value: 50,
    completed_at: `${date}T12:00:00`,
    ...over,
  } as unknown as Task;
}

const names: Record<string, string> = { maths: 'Math', essays: 'Essays', chem: 'Chemistry' };
const nameOf = (id: string) => names[id] ?? id;

describe('the gap diagnosis names the days', () => {
  // Worked Mon-Fri, off every weekend, plus a three-day break (Sep 24-26).
  const now = fortnight('2026-09-21', [0, 1, 2, 6, 7, 8, 9, 13], 120);
  const before = fortnight('2026-09-07', [0, 1, 2, 3, 4, 7, 8, 9, 10, 11], 120);
  const tasks = [done('essays', '2026-09-23'), done('maths', '2026-09-28')];
  const found = diagnose(vitals(now, tasks), vitals(before, tasks), nameOf);
  const gap = found.find((item) => item.id === 'gap')!;

  it('says when the longest break was', () => {
    expect(gap.detail).toContain('Sep 24 to Sep 26');
  });

  it('names the weekday missed most and the subject before the break', () => {
    expect(gap.points.some((line) => /is the day you miss most/.test(line))).toBe(true);
    expect(gap.points).toContain('Before the longest break you were on Essays.');
  });

  it('turns the action into a day and a subject', () => {
    expect(gap.action).toMatch(/^Put a 15-minute Essays task on \w+day/);
  });
});

describe('more focus, same results, says where the time went', () => {
  const now = fortnight('2026-09-21', [0, 1, 2, 3, 4, 7, 8, 9, 10, 11], 100, 120);
  const before = fortnight('2026-09-07', [0, 1, 2, 3, 4, 7, 8, 9, 10, 11], 100, 60);
  const tasks = [
    done('chem', '2026-09-08', { completion_seconds: 1800 } as Partial<Task>),
    done('chem', '2026-09-22', { completion_seconds: 5400 } as Partial<Task>),
    done('maths', '2026-09-23', { completion_seconds: 1800, xp_value: 200 } as Partial<Task>),
    done('maths', '2026-09-09', { completion_seconds: 1800, xp_value: 200 } as Partial<Task>),
  ];
  const item = diagnose(vitals(now, tasks), vitals(before, tasks), nameOf).find(
    (row) => row.id === 'time-without-return',
  )!;

  it('gives XP per hour before and after', () => {
    expect(item.points[0]).toBe("That's 50 XP an hour of focus, down from 100.");
  });

  it('does not compare against a timer that was barely used', () => {
    const quiet = fortnight('2026-09-07', [0, 1, 2, 3, 4, 7, 8, 9, 10, 11], 100, 2);
    const loud = fortnight('2026-09-21', [0, 1, 2, 3, 4, 7, 8, 9, 10, 11], 100, 120);
    const row = diagnose(vitals(loud, tasks), vitals(quiet, tasks), nameOf).find(
      (one) => one.id === 'time-without-return',
    )!;
    expect(row.points[0]).toContain("wasn't being tracked yet");
  });

  it('names the subject that took the extra time and the one that pays best', () => {
    expect(item.points.join(' ')).toContain('The extra time went mostly to Chemistry');
    expect(item.points.join(' ')).toContain('Math earns the most per hour');
    expect(item.action).toBe('Cap Chemistry sessions at 45 min and give the time back to Math.');
  });
});

describe('the five-year milestones', () => {
  it('reaches a level at the XP the level math says', () => {
    expect(levelForTotalXp(xpForLevel(30)).level).toBe(30);
    expect(levelForTotalXp(xpForLevel(30) - 1).level).toBe(29);
  });

  it('dates the next round levels, XP goals and the next round total at both paces', () => {
    const goal = {
      id: 'g', title: 'Earn 250,000 XP', status: 'active', measure: 'xp', goal_type: 'xp',
      target_xp: 250_000, current_xp: 150_000, deadline: '2027-06-01',
    } as unknown as Goal;
    const rows = outlookMilestones({ banked: 86_000, current: 50_000, improved: 100_000, goals: [goal] });
    expect(rows.map((row) => row.label)).toEqual(['Level 50', 'Level 60', 'Earn 250,000 XP', '100K XP in total']);
    const target = rows.find((row) => row.kind === 'goal')!;
    expect(target.atPace).toBe(730);
    expect(target.withChanges).toBe(365);
  });

  it('leaves a milestone past ten years undated', () => {
    const rows = outlookMilestones({ banked: 0, current: 10, improved: 20, goals: [] });
    expect(rows.every((row) => row.atPace === null)).toBe(true);
  });

  it('says how much sooner in words', () => {
    expect(sooner(240)).toBe('8 months sooner');
    expect(sooner(800)).toBe('2 years sooner');
    expect(sooner(0)).toBe('Same time');
  });
});
