/**
 * The open tree's next session. See ./TreePlan and backend/tracking/skill_plan.py.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookSkillSession, skillPlan, type SkillPlan, type Suggestion } from '@/services/skillPlan';
import { TreePlan } from './TreePlan';

vi.mock('@/services/skillPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/skillPlan')>();
  return { ...actual, skillPlan: vi.fn(), bookSkillSession: vi.fn() };
});

const step = (over: Partial<Suggestion>): Suggestion => ({
  kind: 'step-back',
  node_id: 'm.arith',
  node: 'Arithmetic',
  from_id: 'm.fractions',
  ordinal: null,
  weight: 'core',
  level_word: 'Medium',
  title: 'Step back to Arithmetic',
  because: "You got 3 of 8 right on Fractions lately. It builds on Arithmetic, where you've got 43% right lately. Shore that up first.",
  minutes: 20,
  ...over,
});

const plan = (over: Partial<SkillPlan> = {}): SkillPlan => {
  const review = step({
    kind: 'review', node_id: 'm.fractions', node: 'Fractions', level_word: null, weight: null,
    title: 'Redo 2 problems you missed', because: 'From Fractions. They come back until you get them right.',
    minutes: 6, count: 2,
  });
  const main = step({});
  const cold = step({ kind: 'cold', node_id: 'm.decimals', node: 'Decimals', title: 'Warm up Decimals',
                      because: "You haven't practiced it in 25 days. 10 minutes keeps it.", minutes: 10 });
  return {
    tree: 'mathematics',
    title: 'Mathematics',
    subject: 'mathematics',
    suggestions: [review, main, cold, step({ kind: 'ready', node_id: 'm.ratios', title: "You're ready for Ratios",
                                             because: "It builds on Fractions, and you've got it." })],
    session: { blocks: [review, main, cold], minutes: 36, budget: 30 },
    session_title: 'Mathematics: redo 2 misses, then Arithmetic (Medium)',
    due: [],
    skills: 40,
    practiced: 6,
    got: 3,
    budgets: [20, 30, 45, 60],
    ...over,
  };
};

const draw = (onPick = vi.fn()) =>
  render(
    <MemoryRouter>
      <TreePlan tree="mathematics" username="tester" onPick={onPick} />
    </MemoryRouter>,
  );

describe('TreePlan', () => {
  beforeEach(() => {
    vi.mocked(skillPlan).mockReset();
    vi.mocked(bookSkillSession).mockReset();
    window.localStorage.clear();
  });

  it('says the session in one line, then each block with its reason', async () => {
    vi.mocked(skillPlan).mockResolvedValue({ success: true, ...plan() });
    draw();
    expect(await screen.findByText(/36 min · Redo 2 problems you missed, then Step back to Arithmetic/)).toBeInTheDocument();
    expect(screen.getByText('Step back')).toBeInTheDocument();
    expect(screen.getByText(/Shore that up first\./)).toBeInTheDocument();
    expect(screen.getByText("You've practiced 6 of 40 skills here, and 3 are solid. The plan comes from your answers.")).toBeInTheDocument();
  });

  it('points a block at its skill on the tree', async () => {
    vi.mocked(skillPlan).mockResolvedValue({ success: true, ...plan() });
    const onPick = vi.fn();
    draw(onPick);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Show it on the tree' }))[0]!);
    expect(onPick).toHaveBeenCalledWith('m.arith');
  });

  it('keeps the other ideas folded under the session', async () => {
    vi.mocked(skillPlan).mockResolvedValue({ success: true, ...plan() });
    draw();
    expect(await screen.findByText('1 more idea for Mathematics')).toBeInTheDocument();
  });

  it('asks again at another length', async () => {
    vi.mocked(skillPlan).mockResolvedValue({ success: true, ...plan() });
    draw();
    fireEvent.click(await screen.findByRole('button', { name: '45m' }));
    await waitFor(() => expect(skillPlan).toHaveBeenLastCalledWith('mathematics', 45));
  });

  it('books the session and says when', async () => {
    vi.mocked(skillPlan).mockResolvedValue({ success: true, ...plan() });
    vi.mocked(bookSkillSession).mockResolvedValue({
      success: true, task_id: 't1', title: 'Mathematics: x', minutes: 30,
      start: '2026-10-20T16:15', end: '2026-10-20T16:45',
    });
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'Book it' }));
    expect(await screen.findByText(/Booked for Tue 4:15 PM\. It's on your calendar\./)).toBeInTheDocument();
    expect(bookSkillSession).toHaveBeenCalledWith('mathematics', 30);
  });

  it('folds to one line and remembers it', async () => {
    vi.mocked(skillPlan).mockResolvedValue({ success: true, ...plan() });
    const first = draw();
    fireEvent.click(await screen.findByRole('button', { name: /Your next session/ }));
    expect(screen.queryByText('Step back')).not.toBeInTheDocument();
    first.unmount();
    draw();
    await screen.findByText(/36 min/);
    expect(screen.queryByText('Step back')).not.toBeInTheDocument();
  });

  it('draws nothing when there is no session to offer', async () => {
    vi.mocked(skillPlan).mockResolvedValue({ success: true, ...plan({ session: { blocks: [], minutes: 0, budget: 30 } }) });
    const { container } = draw();
    await waitFor(() => expect(skillPlan).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
