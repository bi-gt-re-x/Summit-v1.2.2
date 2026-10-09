/**
 * "X and Y happen on the same day" — the pairing line under Patterns.
 *
 * Each pair is one key, so it has to be counted once per day. Counting both
 * orders doubled it, and the card printed more shared days than days worked.
 */
import { describe, expect, it } from 'vitest';
import { habitPatterns, type Habit } from './habits';
import type { Task } from '@/types';

function task(title: string, completed_at: string): Task {
  return {
    id: `${title}-${completed_at}`, user_id: 'u', title, description: '',
    priority: 'medium', status: 'done', xp_value: 10,
    created_at: completed_at, completed_at,
  } as Task;
}

const habit = (id: string, name: string) => ({ id, name, key: `stem:${name}` }) as Habit;

describe('habitPatterns pairing', () => {
  it('counts a pair once per day, never more days than were worked', () => {
    const tasks: Task[] = [];
    for (let d = 1; d <= 6; d++) {
      const day = `2026-01-0${d}`;
      tasks.push(task('Reading', `${day}T08:00:00`), task('Gym', `${day}T18:00:00`));
    }
    const pairing = habitPatterns(
      tasks,
      [habit('a', 'Reading'), habit('b', 'Gym')],
      '2026-01-01',
      '2026-01-31',
    ).find((pattern) => pattern.id === 'pairing');
    expect(pairing?.support).toBe('6 of 6 days');
  });
});
