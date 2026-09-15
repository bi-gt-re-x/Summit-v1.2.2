/**
 * The family diagram, and the row that has to hold the tree you are in.
 *
 * `siblingsOf` leaves the open tree out — right for a list headed "Beside",
 * wrong for a row: a rung of four drawn as three has hidden the only one the
 * reader was looking for. The page hands in every child of the parent and this
 * lights one of them, so the test that matters is that the lit one is present
 * and is *not* a button. A control that does nothing when pressed teaches a
 * reader to stop pressing them.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TreeFamily } from './TreeFamily';
import type { SubjectTree } from '@/skills/subjectTrees';

const tree = (id: string, title: string, parent?: string): SubjectTree => ({
  id,
  title,
  blurb: '',
  parent,
  nodes: [],
});

const CODING = tree('coding', 'Coding');
const WEB = tree('web', 'Web Development', 'coding');
const ALGO = tree('algorithms', 'Algorithms', 'coding');
const GRAPHS = tree('graphs', 'Graphs', 'algorithms');

function draw(over: Partial<React.ComponentProps<typeof TreeFamily>> = {}) {
  const onGo = vi.fn();
  render(
    <TreeFamily here={ALGO} up={CODING} peers={[WEB, ALGO]} into={[GRAPHS]} onGo={onGo} {...over} />,
  );
  return { onGo };
}

describe('the tree family', () => {
  it('shows the rung with the open tree on it', () => {
    draw();
    expect(screen.getByText('Web Development')).toBeInTheDocument();
    expect(screen.getByText('Algorithms')).toBeInTheDocument();
    // The one you are in is not a way to somewhere else.
    expect(screen.queryByRole('button', { name: 'Algorithms' })).toBeNull();
    expect(screen.getByText('Algorithms')).toHaveAttribute('aria-current', 'page');
  });

  it('walks up, across and down', async () => {
    const user = userEvent.setup();
    const { onGo } = draw();

    await user.click(screen.getByRole('button', { name: 'Coding' }));
    await user.click(screen.getByRole('button', { name: 'Web Development' }));
    await user.click(screen.getByRole('button', { name: 'Graphs' }));

    expect(onGo.mock.calls.map(([id]) => id)).toEqual(['coding', 'web', 'graphs']);
  });

  it('draws nothing where a tree has no family', () => {
    // A root with no children: three empty rows under a heading would be a
    // control explaining that there is no control.
    const { container } = render(
      <TreeFamily here={CODING} up={null} peers={[CODING]} into={[]} onGo={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
