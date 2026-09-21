/**
 * The counters, and the line between them and everything else on the page.
 *
 * The whole tab rests on one distinction: *who moves the number*. An outcome
 * goal is work somebody is doing, and its percentage follows checkpoints they
 * tick. These four are counts the app maintains — the target is chosen once
 * and the figure is never touched again, because touching it would be the
 * account editing its own record of what it did.
 *
 * Nothing on the screen used to say so. They were rows with a title, a bar and
 * two buttons, which is the shape of an outcome goal, so four counters read as
 * four more goals with a different icon. That is the failure these tests are
 * about: not a crash, a category error the interface was actively encouraging.
 *
 * They are drawn on the outcome card's shell now, which is that same shape on
 * purpose — one page, one idea of what a goal looks like. So the category error
 * is no longer held off by the layout being different, and every one of these
 * tests is now load-bearing rather than corroborating. What holds it off is
 * said in words and checked below: a badge reading "System goal", a line saying
 * the app keeps the count, no checkpoint panel and nothing shaped like one, and
 * the only two controls being the ones that genuinely belong to the reader.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SystemGoals } from './SystemGoals';
import type { Goal } from '@/types';

const counter = (over: Partial<Goal> = {}): Goal =>
  ({
    id: 'c-1',
    title: 'Earn 50,000 XP',
    status: 'active',
    measure: 'xp',
    category: 'other',
    target_xp: 50_000,
    current_xp: 12_450,
    milestones: [],
    ...over,
  }) as unknown as Goal;

const FOUR = [
  counter(),
  counter({ id: 'c-2', title: 'Reach a 30-day streak', measure: 'streak', target_streak: 30, current_streak: 18 }),
  counter({ id: 'c-3', title: 'Finish 500 tasks', measure: 'tasks', target_tasks: 500, current_tasks: 342 }),
  counter({ id: 'c-4', title: '100 hours of focus', measure: 'focus', target_focus: 6000, current_focus: 5220 }),
];

function show(counters: Goal[] = FOUR) {
  /* Declared here rather than spread in, so each one keeps its `Mock` type and
     `.mock.calls` stays reachable without a cast. */
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onNew = vi.fn();
  render(
    <SystemGoals counters={counters} onEdit={onEdit} onDelete={onDelete} onNew={onNew} />,
  );
  return { onEdit, onDelete, onNew };
}

/**
 * One counter's card, found by the thing it counts.
 *
 * `closest` with a class selector is typed `Element`, where the old `'li'`
 * resolved to an `HTMLLIElement`; `within` wants the narrower one.
 */
const column = (name: string) =>
  screen.getByText(name, { selector: '.ag-tags li' }).closest('.ag-card') as HTMLElement;

describe('saying what a system goal is', () => {
  /* The sentence is the change. Everything else here follows from it. */
  it('states outright that the app keeps the count and the reader picks the target', () => {
    show();
    const lead = screen.getByText(/Targets for totals Summit already tracks/);

    expect(lead).toHaveTextContent(/You set the target/);
    expect(lead).toHaveTextContent(/the total updates automatically/);
  });

  it('names which of the four each card is', () => {
    show();

    // On a card the title is the reader's own — "Earn 50,000 XP" — so the one
    // word that says which counter this is has to be stated somewhere it will
    // not be buried. It is a tag, in the row where an outcome card puts its
    // term and its priority.
    expect(column('XP')).toBeInTheDocument();
    expect(column('Streak')).toBeInTheDocument();
    expect(column('Tasks')).toBeInTheDocument();
    expect(column('Focus')).toBeInTheDocument();
  });

  it('heads the card with the title the reader wrote', () => {
    show();
    // Level 3 specifically: the two panel heads below it are headings too.
    expect(within(column('XP')).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Earn 50,000 XP',
    );
  });

  /* The two things holding off the category error the shell reintroduces. A
     card that looks like an outcome goal has to say that it is not one. */
  it('says on every card that the app keeps the count', () => {
    show();
    for (const name of ['XP', 'Streak', 'Tasks', 'Focus']) {
      const card = within(column(name));
      expect(card.getByText('System goal')).toBeInTheDocument();
      expect(card.getByText(/Summit keeps this count/)).toBeInTheDocument();
    }
  });

  it('draws no checkpoint panel, and nothing shaped like one', () => {
    const { container } = render(
      <SystemGoals counters={FOUR} onEdit={vi.fn()} onDelete={vi.fn()} onNew={vi.fn()} />,
    );

    // Every one of these is a claim about work somebody is doing.
    expect(container.querySelector('.ag-steps')).toBeNull();
    expect(container.querySelector('.ag-focus')).toBeNull();
    expect(container.querySelector('.ag-next')).toBeNull();
    expect(screen.queryByText(/checkpoint/i)).toBeNull();
  });
});

describe('the figures', () => {
  it('leads with the count and says what it is counting toward', () => {
    show();
    const xp = within(column('XP'));

    expect(xp.getByText('12,450')).toBeInTheDocument();
    expect(xp.getByText(/of 50,000/)).toBeInTheDocument();
    // The percentage moved to the header, beside the ring, where an outcome
    // card carries it. The panel says the distance instead, which is the thing
    // the figure above it does not already state.
    expect(xp.getByText('25%')).toBeInTheDocument();
    expect(xp.getByText(/37,550 xp to go/i)).toBeInTheDocument();
  });

  it('shows focus as time rather than as a count of minutes', () => {
    show();
    // 5,220 minutes is 87 hours, and "5220 of 6000" is not a thing anybody
    // set out to do.
    expect(within(column('Focus')).getByText(/87h/)).toBeInTheDocument();
  });

  /* The point of the distinction, made testable: there is nowhere to type the
     app's own figure. The only inputs a reader gets are the two buttons. */
  it('offers no way to edit the count itself', () => {
    const { container } = render(
      <SystemGoals counters={FOUR} onEdit={vi.fn()} onDelete={vi.fn()} onNew={vi.fn()} />,
    );

    expect(container.querySelector('input')).toBeNull();
    expect(within(column('XP')).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Change target',
      'Remove',
    ]);
  });
});

describe('the two things that belong to the reader', () => {
  it('hands the counter back for a new target', async () => {
    const user = userEvent.setup();
    const props = show();

    await user.click(within(column('Streak')).getByRole('button', { name: 'Change target' }));
    expect(props.onEdit).toHaveBeenCalledTimes(1);
    expect(props.onEdit.mock.calls[0]![0].id).toBe('c-2');
  });

  it('names which counter a Remove would drop', async () => {
    const user = userEvent.setup();
    const props = show();

    // Four buttons all reading "Remove" is four identical controls to a screen
    // reader; the label says which one this is.
    await user.click(screen.getByRole('button', { name: 'Remove the Tasks target' }));
    expect(props.onDelete.mock.calls[0]![0].id).toBe('c-3');
  });

  it('asks for a first one when none are set', async () => {
    const user = userEvent.setup();
    const props = show([]);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set one' }));
    expect(props.onNew).toHaveBeenCalledTimes(1);
  });
});
