/**
 * A system goal comes out as a counter.
 *
 * The failure this replaces was quiet: "Set one" on the System tab opened the
 * outcome wizard, and what it made was an outcome goal with checkpoints under
 * it, filed on the other tab, counting nothing. What is pinned here is the
 * shape of what gets sent — the measure, the target field that goes with it,
 * and the absence of everything an outcome carries.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SystemGoalWizard } from './SystemGoalWizard';
import type { Goal } from '@/types';

function show(counters: Goal[] = []) {
  const onSave = vi.fn();
  render(
    <SystemGoalWizard open busy={false} counters={counters} onClose={vi.fn()} onSave={onSave} />,
  );
  return onSave;
}

const next = () => screen.getByRole('button', { name: 'Next' });

describe('the system goal setup', () => {
  /* Three: focus time can't move since the focus timer was removed
     (2026-10-31), so it isn't offered for a new counter. */
  it('offers the three counters that can still move', () => {
    show();
    const list = screen.getByRole('list', { name: 'What to count' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual([
      'XP', 'Streak', 'Tasks',
    ]);
  });

  it('will not go on until one is picked', async () => {
    const user = userEvent.setup();
    show();
    expect(next()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^streak/i }));
    expect(next()).toBeEnabled();
  });

  it('says when one of a kind is already running', () => {
    show([{ id: 'g9', goal_type: 'xp', title: 'Earn 10,000 XP' } as unknown as Goal]);
    expect(screen.getByRole('button', { name: /^xp/i })).toHaveTextContent('1 running');
  });

  it('will not save without a target', async () => {
    const user = userEvent.setup();
    const onSave = show();
    await user.click(screen.getByRole('button', { name: /^tasks/i }));
    await user.click(next());
    expect(screen.getByRole('button', { name: 'Set goal' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sends a counter, with the target in the field that counter reads', async () => {
    const user = userEvent.setup();
    const onSave = show();
    await user.click(screen.getByRole('button', { name: /^tasks/i }));
    await user.click(next());
    await user.type(screen.getByLabelText(/target \(tasks\)/i), '20');
    await user.click(screen.getByRole('button', { name: 'Set goal' }));

    const sent = onSave.mock.calls[0]![0];
    expect(sent).toMatchObject({
      title: 'Complete 20 tasks',
      goal_type: 'tasks',
      measure: 'tasks',
      target_tasks: 20,
    });
    // Nothing an outcome carries.
    expect(sent).not.toHaveProperty('milestones');
    expect(sent).not.toHaveProperty('subject_ids');
  });

  it('keeps a title the reader wrote when the number changes', async () => {
    const user = userEvent.setup();
    const onSave = show();
    await user.click(screen.getByRole('button', { name: /^xp/i }));
    await user.click(next());
    await user.type(screen.getByLabelText(/target \(xp\)/i), '5000');
    expect(screen.getByLabelText('Call it')).toHaveValue('Earn 5,000 XP');

    await user.clear(screen.getByLabelText('Call it'));
    await user.type(screen.getByLabelText('Call it'), 'Summer XP');
    await user.type(screen.getByLabelText(/target \(xp\)/i), '0');
    await user.click(screen.getByRole('button', { name: 'Set goal' }));

    expect(onSave.mock.calls[0]![0]).toMatchObject({ title: 'Summer XP', target_xp: 50000 });
  });
});
