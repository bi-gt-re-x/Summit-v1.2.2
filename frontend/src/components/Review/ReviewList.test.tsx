/**
 * The review list. See ./ReviewList and backend/tracking/review.py.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { skillAttempts } from '@/services';
import { markReview, type ReviewItem } from '@/services/review';
import { ReviewList, outcomeText } from './ReviewList';

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>();
  return { ...actual, skillAttempts: { ...actual.skillAttempts, add: vi.fn() } };
});

vi.mock('@/services/review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/review')>();
  return { ...actual, markReview: vi.fn() };
});

const item = (over: Partial<ReviewItem>): ReviewItem => ({
  key: 'p:m.quadratics#2#3',
  kind: 'problem',
  state: 'due',
  rung: 0,
  reviews_left: 4,
  missed_on: '2026-10-19',
  due: '2026-10-20',
  late: 0,
  title: 'Factor Simple Quadratics',
  where: 'Quadratics',
  line: 'Missed yesterday. 2nd try.',
  minutes: 3,
  tree: 'algebra',
  tree_title: 'Algebra',
  node_id: 'm.quadratics',
  ordinal: 2,
  slot: 3,
  weight: 'core',
  level: 'Medium',
  prompt: 'Factor x^2 + 5x + 6.',
  answer: '(x + 2)(x + 3)',
  hint: 'Two numbers that add to 5.',
  problems: [],
  subject: null,
  task_id: null,
  got: null,
  of: null,
  missed: null,
  ...over,
});

const draw = (items: ReviewItem[], onAnswered = vi.fn()) =>
  render(
    <MemoryRouter>
      <ReviewList items={items} onAnswered={onAnswered} />
    </MemoryRouter>,
  );

describe('ReviewList', () => {
  beforeEach(() => {
    vi.mocked(skillAttempts.add).mockReset();
    vi.mocked(markReview).mockReset();
  });

  it('opens the first problem, and asks only once the answer is out', () => {
    draw([item({})]);
    expect(screen.getByText('Factor x^2 + 5x + 6.')).toBeInTheDocument();
    expect(screen.getByText('Quadratics · Algebra. Missed yesterday. 2nd try.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByText('Two numbers that add to 5.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('(x + 2)(x + 3)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('saves a right answer as a skill attempt and says when it is back', async () => {
    vi.mocked(skillAttempts.add).mockResolvedValue({ success: true, attempt: {} as never, levels: {} });
    const onAnswered = vi.fn();
    draw([item({}), item({ key: 'p:m.quadratics#2#4', slot: 4, title: 'Second one' })], onAnswered);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(await screen.findByText('Nice. Back in 3 days.')).toBeInTheDocument();
    expect(skillAttempts.add).toHaveBeenCalledWith({
      node_id: 'm.quadratics', ordinal: 2, slot: 3, weight: 'core', attempted: 1, correct: 1, source: 'problem',
    });
    expect(onAnswered).toHaveBeenCalled();
    // Straight on to the next one.
    expect(screen.getAllByText('Factor x^2 + 5x + 6.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Second one/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('a miss says it is back tomorrow', async () => {
    vi.mocked(skillAttempts.add).mockResolvedValue({ success: true, attempt: {} as never, levels: {} });
    draw([item({ rung: 2 })]);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Missed it' }));
    expect(await screen.findByText("No problem. It's back tomorrow.")).toBeInTheDocument();
  });

  it('a set is marked with two buttons', async () => {
    vi.mocked(markReview).mockResolvedValue({ success: true } as never);
    draw([item({ key: 't:9', kind: 'set', title: 'Quadratics #1-10', got: 6, of: 10, missed: 4, level: null, prompt: null })]);
    expect(screen.getByText('Redo the 4 you missed in "Quadratics #1-10"')).toBeInTheDocument();
    expect(screen.getByText(/Redo the 4 you got wrong last time \(6 of 10 right\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Got them all' }));
    expect(await screen.findByText('Nice. Back in 3 days.')).toBeInTheDocument();
    expect(markReview).toHaveBeenCalledWith('t:9', 'right');
  });

  it('a step is reviewed by answering its problems', async () => {
    vi.mocked(skillAttempts.add).mockResolvedValue({ success: true, attempt: {} as never, levels: {} });
    draw([
      item({
        key: 's:m.quadratics#2',
        kind: 'step',
        level: null,
        prompt: null,
        problems: [
          { slot: 3, weight: 'core', prompt: 'P one', answer: 'A one', hint: '' },
          { slot: 4, weight: 'core', prompt: 'P two', answer: 'A two', hint: '' },
        ],
      }),
    ]);
    expect(screen.getByText('Do these 2. Get 80% right and the step moves up.')).toBeInTheDocument();
    for (const name of ['Show answer', 'Show answer']) {
      fireEvent.click(screen.getAllByRole('button', { name })[0]!);
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'Got it' })[0]!);
    await screen.findByText('Right');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(await screen.findByText('Nice. Back in 3 days.')).toBeInTheDocument();
    expect(skillAttempts.add).toHaveBeenCalledTimes(2);
  });

  it('says why when a save fails', async () => {
    vi.mocked(markReview).mockResolvedValue({ success: false, message: "That isn't on your review list any more." });
    draw([item({ key: 't:9', kind: 'set', got: 6, of: 10, missed: 4, prompt: null })]);
    fireEvent.click(screen.getByRole('button', { name: 'Still missed some' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That isn't on your review list any more.");
  });

  it('a problem with no words here points at the tree', () => {
    draw([item({ prompt: null, answer: null })]);
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/skill-trees?node=m.quadratics');
  });
});

describe('outcomeText', () => {
  it('says when it is back, or that it is cleared', () => {
    expect(outcomeText({ right: true, days: 7 })).toBe('Nice. Back in 7 days.');
    expect(outcomeText({ right: true, days: null })).toBe("Cleared. That one's stuck.");
  });
});
