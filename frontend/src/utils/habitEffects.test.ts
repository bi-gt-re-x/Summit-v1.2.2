/**
 * What a habit is worth — the week, the condition, and the effect.
 *
 * The three readings are independent and each has its own floor, so each is
 * tested for the thing it says *and* for the case where it must stay quiet. The
 * quiet cases are the ones worth having: a consequence line drawn from four
 * tasks is how a page loses a reader's trust in one screen.
 *
 * The bucketing is pinned here too — that a task reaches the habit it was
 * counted under. `Habit.key` exists precisely because the display name does not
 * map back to the tasks, and a test that built its habits by hand would not
 * notice if that broke.
 */
import { describe, expect, it } from 'vitest';
import { habitEffects } from './habitEffects';
import { buildHabits } from './habits';
import type { GrowthDay, Task } from '@/types';

const DAY = 86400000;

/** An ISO day `back` days before 2026-03-01. */
function ago(back: number): string {
  return new Date(Date.parse('2026-03-01T00:00:00Z') - back * DAY).toISOString().slice(0, 10);
}

interface Made {
  day: number;
  subject?: string;
  title?: string;
  difficulty?: number;
  execution?: number;
  hour?: number;
}

function task({ day, subject, title = 'Practice', difficulty, execution, hour = 10 }: Made): Task {
  const at = `${ago(day)}T${String(hour).padStart(2, '0')}:00:00`;
  return {
    id: `${title}-${day}-${hour}-${subject ?? ''}`,
    title,
    status: 'done',
    completed_at: at,
    created_at: at,
    xp_value: 10,
    ...(subject ? { subject } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(execution ? { execution } : {}),
  } as unknown as Task;
}

function day(over: Partial<GrowthDay> & { date: string }): GrowthDay {
  return {
    day_number: 1,
    xp_earned: 20,
    tasks_completed: 2,
    cumulative_xp: 20,
    avg_task_xp: 10,
    focus_minutes: 60,
    cumulative_focus_minutes: 60,
    rated_tasks: 0,
    quality_score: 0,
    avg_difficulty: 0,
    avg_execution: 0,
    ...over,
  };
}

const nameOf = (id: string) => id;
const TO = ago(0);
const FROM = ago(60);

/** Habits over these tasks, and the facts for each. */
function read(tasks: Task[], days: GrowthDay[] = []) {
  const habits = buildHabits(tasks, nameOf, FROM, TO);
  return { habits, facts: habitEffects({ habits, tasks, days, toIso: TO }) };
}

describe('the week', () => {
  it('counts this week against last', () => {
    const tasks = [
      // 4 inside the last 7 days, 2 in the 7 before.
      ...[1, 2, 3, 4].map((back) => task({ day: back, subject: 'maths' })),
      ...[8, 9].map((back) => task({ day: back, subject: 'maths' })),
    ];
    const { habits, facts } = read(tasks);
    const maths = habits.find((habit) => habit.key === 'subject:maths');
    expect(maths).toBeTruthy();
    expect(facts.get('subject:maths')?.week).toEqual({ now: 4, before: 2, change: 2 });
  });

  it('reaches the habit through its key, not its name', () => {
    /* The routine's card is headed with the commonest spelling — "Violin
       Practice" — while the bucket key is the stem. If the effects module ever
       matched on the name, this is the test that fails. */
    const tasks = [1, 2, 3, 9, 10].map((back) =>
      task({ day: back, title: back < 5 ? 'Violin practice #2' : 'violin practice' }),
    );
    const { facts } = read(tasks);
    expect(facts.get('stem:violin practice')?.week).toEqual({ now: 3, before: 2, change: 1 });
  });
});

describe('the effect', () => {
  const rated = (day: number, subject: string, execution: number) =>
    task({ day, subject, difficulty: 3, execution });

  it('compares the habit against everything else, on how the work goes', () => {
    const tasks = [
      ...Array.from({ length: 10 }, (_, at) => rated(at + 1, 'maths', 5)),
      ...Array.from({ length: 10 }, (_, at) => rated(at + 1, 'history', 3)),
    ];
    const effect = read(tasks).facts.get('subject:maths')?.effect;
    // 5 against 3 is a 67% lift, over 10 tasks each side.
    expect(effect?.measure).toBe('how the work goes');
    expect(Math.round(effect?.lift ?? 0)).toBe(67);
    expect(effect?.basis).toContain('10 rated tasks here against 10 elsewhere');
  });

  it('stays quiet when the two sides are the same', () => {
    const tasks = [
      ...Array.from({ length: 10 }, (_, at) => rated(at + 1, 'maths', 4)),
      ...Array.from({ length: 10 }, (_, at) => rated(at + 1, 'history', 4)),
    ];
    expect(read(tasks).facts.get('subject:maths')?.effect).toBeNull();
  });

  it('falls back to tasks a day when nothing is rated, and says so', () => {
    /* No ratings anywhere, so there is no verdict to compare. The claim becomes
       a different one — output on the days it happens — and the measure names
       it rather than passing it off as quality. */
    const tasks = Array.from({ length: 8 }, (_, at) => task({ day: at + 1, subject: 'maths' }));
    const days = [
      // The 8 days the habit ran, with more finished on them.
      ...Array.from({ length: 8 }, (_, at) => day({ date: ago(at + 1), tasks_completed: 4 })),
      // 8 working days without it.
      ...Array.from({ length: 8 }, (_, at) => day({ date: ago(at + 20), tasks_completed: 2 })),
    ];
    const effect = read(tasks, days).facts.get('subject:maths')?.effect;
    expect(effect?.measure).toBe('tasks finished a day');
    expect(Math.round(effect?.lift ?? 0)).toBe(100);
  });

  it('refuses the day-level reading with too few days either side', () => {
    const tasks = Array.from({ length: 5 }, (_, at) => task({ day: at + 1, subject: 'maths' }));
    const days = [
      ...Array.from({ length: 5 }, (_, at) => day({ date: ago(at + 1), tasks_completed: 4 })),
      ...Array.from({ length: 3 }, (_, at) => day({ date: ago(at + 20), tasks_completed: 2 })),
    ];
    expect(read(tasks, days).facts.get('subject:maths')?.effect).toBeNull();
  });
});

describe('the condition', () => {
  it('names the focus band the habit goes best in', () => {
    /* 8 tasks on 60-minute days rated 5, 8 on 20-minute days rated 3. The band
       is the reading, and the label is something a reader can plan around. */
    const good = Array.from({ length: 8 }, (_, at) =>
      task({ day: at + 1, subject: 'maths', difficulty: 3, execution: 5 }),
    );
    const bad = Array.from({ length: 8 }, (_, at) =>
      task({ day: at + 20, subject: 'maths', difficulty: 3, execution: 3 }),
    );
    const days = [
      ...Array.from({ length: 8 }, (_, at) => day({ date: ago(at + 1), focus_minutes: 60 })),
      ...Array.from({ length: 8 }, (_, at) => day({ date: ago(at + 20), focus_minutes: 20 })),
    ];
    const condition = read([...good, ...bad], days).facts.get('subject:maths')?.condition;
    expect(condition?.label).toBe('45-75 minutes of focus');
    expect(Math.round(condition?.lift ?? 0)).toBe(67);
  });

  it('names the time of day where that is the split that separates', () => {
    const morning = Array.from({ length: 8 }, (_, at) =>
      task({ day: at + 1, subject: 'maths', difficulty: 3, execution: 5, hour: 9 }),
    );
    const evening = Array.from({ length: 8 }, (_, at) =>
      task({ day: at + 20, subject: 'maths', difficulty: 3, execution: 3, hour: 20 }),
    );
    const condition = read([...morning, ...evening]).facts.get('subject:maths')?.condition;
    expect(condition?.label).toBe('before 5pm');
  });

  it('stays quiet under twelve rated tasks', () => {
    const tasks = Array.from({ length: 10 }, (_, at) =>
      task({ day: at + 1, subject: 'maths', difficulty: 3, execution: at < 5 ? 5 : 2, hour: at < 5 ? 9 : 20 }),
    );
    expect(read(tasks).facts.get('subject:maths')?.condition).toBeNull();
  });
});
