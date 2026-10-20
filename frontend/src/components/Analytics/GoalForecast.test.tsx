/**
 * The goal forecast card. See ./GoalForecast and backend/tracking/forecast.py.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalForecast as Forecast } from '@/services/forecast';
import { bookForecast, goalForecast } from '@/services/forecast';
import { GoalForecast } from './GoalForecast';

vi.mock('@/services/forecast', () => ({
  goalForecast: vi.fn(),
  bookForecast: vi.fn(),
}));

const row = (over: Partial<Forecast>): Forecast => ({
  goal_id: 'g1',
  title: 'AIME',
  deadline: '2027-02-05',
  days_left: 30,
  state: 'behind',
  missing: null,
  line: 'Due Feb 5. At this pace you finish Feb 19. 2 more sessions a week gets you there.',
  facts: '4 of 10 steps done. About 2 sessions a week lately.',
  per_week: 2,
  need_per_week: 3.4,
  more_per_week: 2,
  finish: '2027-02-19',
  to_book: 3,
  booked_this_week: 0,
  ...over,
});

const serve = (goals: Forecast[]) => vi.mocked(goalForecast).mockResolvedValue({ success: true, goals });

describe('GoalForecast', () => {
  beforeEach(() => {
    vi.mocked(goalForecast).mockReset();
    vi.mocked(bookForecast).mockReset();
  });

  it('says when a goal finishes and what gets it there', async () => {
    serve([row({})]);
    render(<GoalForecast />);
    expect(await screen.findByText('Will you make it?')).toBeInTheDocument();
    expect(screen.getByText('AIME')).toBeInTheDocument();
    expect(screen.getByText('Behind')).toBeInTheDocument();
    expect(
      screen.getByText('Due Feb 5. At this pace you finish Feb 19. 2 more sessions a week gets you there.'),
    ).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
  });

  it('books the missing sessions and reads the forecast again', async () => {
    serve([row({})]);
    vi.mocked(bookForecast).mockResolvedValue({
      success: true,
      booked: [
        { task_id: 'a', start: '2026-10-20T08:00', end: '2026-10-20T08:45' },
        { task_id: 'b', start: '2026-10-21T08:00', end: '2026-10-21T08:45' },
      ],
      title: 'Part 3',
      minutes: 45,
    });
    const onBooked = vi.fn();
    render(<GoalForecast onBooked={onBooked} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Book 3 sessions this week' }));
    expect(await screen.findByText("Booked 2 sessions. They're on your calendar.")).toBeInTheDocument();
    expect(bookForecast).toHaveBeenCalledWith('g1');
    expect(onBooked).toHaveBeenCalled();
    await waitFor(() => expect(goalForecast).toHaveBeenCalledTimes(2));
  });

  it('shows what is missing, with no button, when there is too little to go on', async () => {
    serve([
      row({
        state: 'missing',
        missing: 'too_new',
        line: 'Due Feb 5. We need two weeks of sessions on Math to tell your pace. You have 5 days so far.',
        facts: '0 of 10 steps done.',
        to_book: 0,
        finish: null,
      }),
    ]);
    render(<GoalForecast />);
    expect(await screen.findByText('Need data')).toBeInTheDocument();
    expect(screen.getByText(/We need two weeks of sessions on Math/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Book/ })).not.toBeInTheDocument();
  });

  it('says what is already booked when the week is covered', async () => {
    serve([row({ to_book: 0, booked_this_week: 3 })]);
    render(<GoalForecast />);
    expect(await screen.findByText(/3 booked this week\./)).toBeInTheDocument();
  });

  it('folds goals past the first three', async () => {
    serve(['a', 'b', 'c', 'd'].map((id) => row({ goal_id: id, title: `Goal ${id}`, to_book: 0 })));
    render(<GoalForecast />);
    expect(await screen.findByText('1 more goal')).toBeInTheDocument();
  });

  it('draws nothing without a dated goal', async () => {
    serve([]);
    const { container } = render(<GoalForecast />);
    await waitFor(() => expect(goalForecast).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('has no dashes or curly quotes in its own copy', async () => {
    serve([row({})]);
    const { container } = render(<GoalForecast />);
    await screen.findByText('AIME');
    expect(container.textContent).not.toMatch(/[—“”‘’]/);
  });
});
