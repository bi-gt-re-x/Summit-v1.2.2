/**
 * Editing a calendar task's repeat.
 *
 * The edit dialog used to hide the repeat entirely, so a task made with
 * "Doesn't repeat" could never be made to repeat, and saving a series with
 * "All occurrences" sent no repeat and collapsed it to one task.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskModal } from './TaskModal';
import { patternOf } from '@/hooks/useBlockActions';

vi.mock('@/hooks/useSubjects', () => ({ useSubjects: () => [] }));
vi.mock('@/hooks/useLinkableGoals', () => ({ useLinkableGoals: () => [] }));

const INITIAL = { name: 'Piano practice', startTime: '17:00', endTime: '18:00', xp: 30 };

describe('a task that does not repeat yet', () => {
  it('offers the repeat when editing, and saves a new repeat as a series', () => {
    const onSave = vi.fn();
    render(<TaskModal initial={INITIAL} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('Days of week'));
    fireEvent.click(screen.getByText('Monday'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [draft, scope] = onSave.mock.calls[0]!;
    expect(draft.recurrence).toBe('weekly');
    expect(draft.recurrenceDays).toEqual([1]);
    expect(scope).toBe('all');
  });

  it('keeps an edit with no repeat to this one task', () => {
    const onSave = vi.fn();
    render(<TaskModal initial={INITIAL} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave.mock.calls[0]![1]).toBe('one');
  });
});

describe('a task that already repeats', () => {
  const pattern = { type: 'weekly' as const, days: [1, 3] };

  it('hides the repeat while editing just this one', () => {
    render(<TaskModal initial={INITIAL} recurring pattern={pattern} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByText('Repeat')).not.toBeInTheDocument();
  });

  it('opens on its own pattern when editing the rest, so saving keeps the series', () => {
    const onSave = vi.fn();
    render(<TaskModal initial={INITIAL} recurring pattern={pattern} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('This one and the rest'));
    expect(screen.getByLabelText('Days of week')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [draft, scope] = onSave.mock.calls[0]!;
    expect(draft.recurrence).toBe('weekly');
    expect(draft.recurrenceDays).toEqual([1, 3]);
    expect(scope).toBe('all');
  });
});

describe('reading a pattern back off the copies', () => {
  it('is none for one date', () => {
    expect(patternOf(['2026-10-19'])).toEqual({ type: 'none', days: [] });
  });

  it('is weekly for the same weekdays', () => {
    // Mondays and Wednesdays across two months.
    const isos = ['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04'];
    expect(patternOf(isos)).toEqual({ type: 'weekly', days: [1, 3] });
  });

  it('is monthly for the same dates', () => {
    const isos = ['2026-10-01', '2026-10-15', '2026-11-01', '2026-11-15', '2026-12-01', '2026-12-15',
      '2027-01-01', '2027-01-15'];
    expect(patternOf(isos)).toEqual({ type: 'monthly', days: [1, 15] });
  });
});
