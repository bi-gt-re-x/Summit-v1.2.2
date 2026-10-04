/**
 * Habits as behaviour → consequence, rather than as a diary.
 *
 * The counts on a habit card — frequency, finished, best run — are pinned
 * elsewhere. What this file asserts is the block underneath them, which is the
 * reason the tab is worth opening: the week against last week, the condition the
 * habit goes best under, and what it is associated with.
 *
 * Also asserted: that a habit with nothing behind it yet draws *none* of those
 * lines. Three greyed placeholders would be worse than the card this replaced,
 * and it is the kind of thing that only breaks when somebody makes the block
 * unconditional to simplify the JSX.
 *
 * The file keeps its name after the merge. Habits is not a tab any more, but
 * the habit half of Insights is still a coherent thing to test on its own, and
 * these cases are about that half and nothing else — ./insightsStory.test.tsx
 * is the other one.
 */
import { InsightsTab } from './InsightsTab';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { draw, fakeModel, nameOf, subjects } from './fixtures';
import { NEED_DAYS } from '../useAnalyticsModel';
import { buildHabits, habitSummary } from '@/utils/habits';
import { habitEffects } from '@/utils/habitEffects';
import { task } from '@/test/factories';
import type { GrowthDay, Task } from '@/types';

const FROM = '2026-06-01';
const TO = '2026-07-31';

/** A rated "Revision" completion on a given day, at a given hour. */
function revision(date: string, hour: number, execution: number): Task {
  return task({
    title: 'Revision',
    status: 'done',
    subject: 'maths',
    difficulty: 3,
    execution,
    completed_at: `${date}T${String(hour).padStart(2, '0')}:00:00`,
  });
}

/**
 * A record with a habit that repeats, and a split inside it worth reading:
 * twelve morning revisions rated 5, nine evening ones rated 3.
 *
 * The morning half sits in the last fortnight so the week counts have something
 * in them; the evening half is earlier.
 */
function record(): { tasks: Task[]; days: GrowthDay[] } {
  const tasks: Task[] = [];
  // 7 in the last 7 days to 2026-07-31, then 5 in the week before it.
  for (let at = 0; at < 7; at += 1) {
    tasks.push(revision(`2026-07-${String(25 + at).padStart(2, '0')}`, 9, 5));
  }
  for (let at = 0; at < 5; at += 1) {
    tasks.push(revision(`2026-07-${String(18 + at).padStart(2, '0')}`, 9, 5));
  }
  // The earlier, worse half — evenings in June.
  for (let at = 0; at < 9; at += 1) {
    tasks.push(revision(`2026-06-${String(2 + at).padStart(2, '0')}`, 20, 3));
  }
  // Something else to compare the habit against.
  const others = Array.from({ length: 10 }, (_, at) =>
    task({
      title: `Admin ${at}`,
      status: 'done',
      subject: 'life',
      difficulty: 3,
      execution: 3,
      completed_at: `2026-07-${String(1 + at).padStart(2, '0')}T12:00:00`,
    }),
  );
  return { tasks: [...tasks, ...others], days: [] };
}

function model(withEffects = true) {
  const { tasks, days } = record();
  const habits = buildHabits(tasks, nameOf, FROM, TO);
  expect(habits.length).toBeGreaterThan(0); // the fixture is doing its job
  return fakeModel({
    historyDays: NEED_DAYS.habits + 10,
    habits,
    summary: habitSummary(habits, []),
    tasks,
    all: days,
    toIso: TO,
    effects: withEffects ? habitEffects({ habits, tasks, days, toIso: TO }) : new Map(),
  });
}

describe('a habit card', () => {
  it('says how many this week and how that compares with last', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getAllByText(/this week/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 from last week/).length).toBeGreaterThan(0);
  });

  it('names the condition the habit goes best under', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getAllByText(/before 5pm/).length).toBeGreaterThan(0);
  });

  it('states what the habit is associated with, and on which measure', () => {
    draw(<InsightsTab model={model()} subjects={subjects} />);
    expect(screen.getAllByText(/on how the work goes/).length).toBeGreaterThan(0);
  });

  it('draws none of it for a habit with nothing behind it', () => {
    draw(<InsightsTab model={model(false)} subjects={subjects} />);
    expect(screen.queryByText(/on how the work goes/)).not.toBeInTheDocument();
    expect(screen.queryByText(/from last week/)).not.toBeInTheDocument();
    // The card itself is still there — this is the block, not the card.
    expect(screen.getAllByText('Revision').length).toBeGreaterThan(0);
  });
});
