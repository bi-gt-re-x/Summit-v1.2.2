/**
 * The search, driven from the keyboard.
 *
 * The rows themselves are a list of buttons and a click on one is not worth a
 * test. What is worth one is the part with state in it: which row the arrow
 * keys are on, and whether Enter takes *that* row. Both were silently correct
 * before this file only because there was one behaviour — Enter always took
 * the first hit — and the way this breaks is quiet: an off-by-one in the wrap,
 * or a highlight that is not reset when the query changes, opens a lattice the
 * reader never asked for and looks like a mis-click rather than a bug.
 *
 * The other half is what the search is *for*: a skill hit has to report the
 * node as well as the tree, or the page cannot select it, cannot fill the
 * panel and has nothing to scroll to. That is one argument in one call and it
 * is the whole contract between this component and pages/SkillTrees.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SubjectRail } from './SubjectRail';
import { SUBJECT_TREES } from '@/skills/subjectTrees';

/* jsdom does no layout, so nothing in it scrolls and `scrollIntoView` is not
   implemented at all. Stubbed here rather than in test/setup, which says a
   single suite's needs belong in the suite — and rather than guarded in the
   component, where it would be dead defensiveness against a method every
   browser has had for twenty years. */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function draw() {
  const onOpen = vi.fn();
  render(<SubjectRail subjects={[]} openTrail={[]} onOpen={onOpen} />);
  return { onOpen, field: screen.getByRole('combobox') };
}

/** The visible rows, in the order they are offered. */
const rows = () => screen.getAllByRole('option').map((row) => row.textContent ?? '');

/** A word that is certainly in the index: the first tree's first skill. The
 *  assertions are the suite saying the catalogue is not empty, which is a
 *  thing check_trees.mjs already fails the build over. */
const tree = SUBJECT_TREES[0]!;
const SKILL = tree.nodes[0]!;

describe('the lattice search', () => {
  it('hands the page the node as well as the tree', async () => {
    const user = userEvent.setup();
    const { onOpen, field } = draw();

    await user.type(field, SKILL.name);
    await user.click(await screen.findByText(SKILL.name));

    expect(onOpen).toHaveBeenCalledWith(tree.id, SKILL.id);
  });

  it('moves the highlight with the arrows and takes it with Enter', async () => {
    const user = userEvent.setup();
    const { onOpen, field } = draw();

    // Two letters is the shortest query the popup opens on.
    await user.type(field, 'al');
    expect(rows().length).toBeGreaterThan(1);

    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'false');

    await user.keyboard('{Enter}');
    const second = onOpen.mock.calls[0];

    /* And the same search taken without the arrow key, which is the row above
       it. Comparing the two is what actually says the highlight decided the
       outcome; either call on its own only says something was opened. */
    onOpen.mockClear();
    await user.type(field, 'al');
    await user.keyboard('{Enter}');
    const first = onOpen.mock.calls[0];

    expect(second).not.toEqual(first);
  });

  it('wraps rather than stopping at the top', async () => {
    const user = userEvent.setup();
    const { field } = draw();

    await user.type(field, 'al');
    const count = rows().length;

    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[count - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('puts the highlight back to the top when the query changes', async () => {
    const user = userEvent.setup();
    const { field } = draw();

    await user.type(field, 'al');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'false');

    await user.type(field, 'g');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('closes on Escape without opening anything', async () => {
    const user = userEvent.setup();
    const { onOpen, field } = draw();

    await user.type(field, 'al');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
