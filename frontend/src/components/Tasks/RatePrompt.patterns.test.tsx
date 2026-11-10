/**
 * The question after a task asks about the Behavior page's patterns that task could
 * show, and saves those answers on their own (backend/api/behavior.py).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ forTask: vi.fn(), answerForTask: vi.fn() }));

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, behavior: service };
});

import { RatePrompt } from './RatePrompt';

afterEach(() => vi.clearAllMocks());

const pattern = { id: 'b1', title: 'Impulsive answers on tests', fix: { id: 'f1', title: 'Answer-confidence checkpoint' }, times: null, used: null };

describe('the patterns row', () => {
  it('asks whether it happened and whether the fix was done, and saves only that', async () => {
    service.forTask.mockResolvedValue({ success: true, behaviors: [pattern] });
    service.answerForTask.mockResolvedValue({ success: true, saved: ['c1'] });
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<RatePrompt taskName="AMC 10 mock" taskId="t9" onSubmit={onSubmit} onClose={onClose} />);
    expect(await screen.findByText('Impulsive answers on tests')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    const happened = screen.getByRole('group', { name: 'Impulsive answers on tests' });
    fireEvent.click(within(happened).getByRole('button', { name: 'Yes' }));
    fireEvent.change(screen.getByLabelText('How many times: Impulsive answers on tests'), { target: { value: '3' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Did you do Answer-confidence checkpoint?' })).getByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(service.answerForTask).toHaveBeenCalledWith('t9', [{ behavior_id: 'b1', times: 3, used: false }]));
    // Nothing was rated, so there's nothing to send as a rating.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sends the ratings as before when there are no patterns', async () => {
    service.forTask.mockResolvedValue({ success: true, behaviors: [] });
    const onSubmit = vi.fn();
    render(<RatePrompt taskName="Read chapter 4" taskId="t1" onSubmit={onSubmit} onClose={vi.fn()} />);
    await waitFor(() => expect(service.forTask).toHaveBeenCalledWith('t1'));
    expect(screen.queryByText('Did any of these happen?')).toBeNull();
    fireEvent.click(screen.getAllByText('★')[3]!);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ difficulty: 4 });
    expect(service.answerForTask).not.toHaveBeenCalled();
  });

  it("doesn't ask at all without a task id", () => {
    render(<RatePrompt taskName="Something" onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(service.forTask).not.toHaveBeenCalled();
  });
});
