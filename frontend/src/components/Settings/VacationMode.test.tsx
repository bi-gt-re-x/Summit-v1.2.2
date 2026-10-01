/**
 * Vacation mode on the Settings page.
 *
 * What is pinned is the arithmetic the reader never sees — "7 days" means today
 * and the six after it, not seven days from tomorrow — and that the control
 * shows what the server decided rather than what was asked for, including a
 * refusal, in its own words.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stats as makeStats } from '@/test/factories';
import { VacationMode } from './VacationMode';

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>();
  return {
    ...actual,
    settings: { ...actual.settings, planVacation: vi.fn(), endVacation: vi.fn() },
  };
});

const { settings: service } = await import('@/services');
const plan = vi.mocked(service.planVacation);
const end = vi.mocked(service.endVacation);

/** A Thursday. */
const TODAY = new Date('2026-09-24T10:00:00');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
  plan.mockReset();
  end.mockReset();
});

describe('starting one', () => {
  it('counts today as the first of the days asked for', async () => {
    const away = { start: '2026-09-24', end: '2026-09-30', active: true };
    plan.mockResolvedValue({ success: true, stats: makeStats({ vacation: away }) });
    const changed = vi.fn();
    render(<VacationMode vacation={null} maxDays={30} onChanged={changed} />);

    expect(screen.getByLabelText('Days away')).toHaveValue(7);
    fireEvent.click(screen.getByRole('button', { name: 'Start vacation' }));

    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(plan).toHaveBeenCalledWith('2026-09-30');
    expect(changed.mock.calls[0]![1]).toMatch(/^On vacation until/);
  });

  it('takes a last day instead, when asked that way', async () => {
    plan.mockResolvedValue({ success: true, stats: makeStats() });
    render(<VacationMode vacation={null} maxDays={30} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Until a date' }));
    fireEvent.change(screen.getByLabelText('Last day away'), { target: { value: '2026-10-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start vacation' }));

    await waitFor(() => expect(plan).toHaveBeenCalledWith('2026-10-04'));
  });

  it('shows a refusal in the words it came back in', async () => {
    plan.mockResolvedValue({ success: false, message: 'A vacation can be at most 30 days long.' });
    const changed = vi.fn();
    render(<VacationMode vacation={null} maxDays={30} onChanged={changed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start vacation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('at most 30 days');
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('while one is running', () => {
  const away = { start: '2026-09-22', end: '2026-09-28', active: true };

  it('says when it ends instead of offering to start another', () => {
    render(<VacationMode vacation={away} maxDays={30} onChanged={vi.fn()} />);
    expect(screen.getByText(/^On vacation until/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start vacation' })).toBeNull();
  });

  it('moves the end, and only once there is a new end to move it to', async () => {
    plan.mockResolvedValue({ success: true, stats: makeStats() });
    render(<VacationMode vacation={away} maxDays={30} onChanged={vi.fn()} />);
    const change = screen.getByRole('button', { name: 'Change' });
    expect(change).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-09-25' } });
    fireEvent.click(change);
    await waitFor(() => expect(plan).toHaveBeenCalledWith('2026-09-25'));
  });

  it('ends early', async () => {
    end.mockResolvedValue({ success: true, stats: makeStats({ vacation: null }) });
    const changed = vi.fn();
    render(<VacationMode vacation={away} maxDays={30} onChanged={changed} />);
    fireEvent.click(screen.getByRole('button', { name: 'End vacation' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(end).toHaveBeenCalled();
  });
});
