/**
 * The control that answers "no goal set for this subject".
 *
 * What is worth pinning is the three things that make it usable rather than
 * merely present: the list is shut and properly shut, every row says what the
 * goal is already about, and the cap of two has a way back out of it. A cap
 * with no undo is a trap, and a shut list that is only visually shut is a tab
 * stop into nowhere.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LinkGoal, MAX_GOALS, type Linkable } from './LinkGoal';

const AIME: Linkable = { id: 'g1', title: 'Reach AIME', subjects: ['Mathematics'] };
const LOOSE: Linkable = { id: 'g2', title: 'Build Summit v2', subjects: [] };

function show(over: Partial<Parameters<typeof LinkGoal>[0]> = {}) {
  const onLink = vi.fn();
  const onUnlink = vi.fn();
  const view = render(
    <MemoryRouter>
      <LinkGoal
        linked={[]}
        options={[AIME, LOOSE]}
        busy=""
        error=""
        onLink={onLink}
        onUnlink={onUnlink}
        {...over}
      />
    </MemoryRouter>,
  );
  return { ...view, onLink, onUnlink };
}

describe('LinkGoal', () => {
  it('keeps the list shut, and shut means inert', async () => {
    // The collapse is a grid row going to 0fr, which hides the rows from the
    // eye and from nothing else. See the same note in ./Fold.
    const { container } = show();

    const body = container.querySelector<HTMLElement>('.sb-link-body')!;
    expect(body).toHaveAttribute('inert');

    await userEvent.click(screen.getByRole('button', { name: /Choose a goal/ }));
    expect(body).not.toHaveAttribute('inert');
  });

  it('says what each goal is already about', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /Choose a goal/ }));

    const row = screen.getByText('Reach AIME').closest('li')!;
    expect(within(row).getByText('Mathematics')).toBeInTheDocument();
  });

  it('says Other for a goal that names no subject, rather than nothing', async () => {
    // A goal nobody has filed anywhere is exactly the one this is offering to
    // file, so the blank is the wrong answer there.
    show();
    await userEvent.click(screen.getByRole('button', { name: /Choose a goal/ }));

    const row = screen.getByText('Build Summit v2').closest('li')!;
    expect(within(row).getByText('Other')).toBeInTheDocument();
  });

  it('offers no more once the cap is reached, but still offers the way out', () => {
    const { onUnlink } = show({
      linked: [{ id: 'g9', title: 'Reach AIME' }, { id: 'g8', title: 'USACO Gold' }],
    });

    expect(screen.getByText(`Aimed at ${MAX_GOALS} of ${MAX_GOALS} goals`))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add another/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
    expect(onUnlink).not.toHaveBeenCalled();
  });

  it('offers the second one while there is room for it', () => {
    show({ linked: [{ id: 'g9', title: 'Reach AIME' }] });

    expect(screen.getByText(`Aimed at 1 of ${MAX_GOALS} goals`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add another/ })).toBeInTheDocument();
  });

  it('hands back the id that was pressed', async () => {
    const { onLink } = show();
    await userEvent.click(screen.getByRole('button', { name: /Choose a goal/ }));

    const row = screen.getByText('Reach AIME').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Use this' }));

    expect(onLink).toHaveBeenCalledWith('g1');
  });

  it('sends the reader to the goals page when they have no outcome goals', () => {
    show({ options: [] });

    expect(screen.getByText(/no outcome goals yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /goals page/ })).toBeInTheDocument();
  });
});
