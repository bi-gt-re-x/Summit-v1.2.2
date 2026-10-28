/**
 * The review panel and the skill trees panel on Recommendations.
 * See ./ReviewPanel, ./SkillTreesPanel.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { skillAttempts } from '@/services';
import { reviewQueue, type ReviewItem, type ReviewQueue } from '@/services/review';
import { skillTrees } from '@/services/skillPlan';
import { ReviewPanel, dayWord } from './ReviewPanel';
import { SkillTreesPanel } from './SkillTreesPanel';

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>();
  return { ...actual, skillAttempts: { ...actual.skillAttempts, add: vi.fn() } };
});
vi.mock('@/services/review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/review')>();
  return { ...actual, reviewQueue: vi.fn() };
});
vi.mock('@/services/skillPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/skillPlan')>();
  return { ...actual, skillTrees: vi.fn() };
});

const item = (key: string, over: Partial<ReviewItem> = {}): ReviewItem => ({
  key, kind: 'problem', state: 'due', rung: 0, reviews_left: 4, missed_on: '2026-10-19', due: '2026-10-20',
  late: 0, title: `Problem ${key}`, where: 'Quadratics', line: 'Missed yesterday. 2nd try.', minutes: 3,
  tree: 'algebra', tree_title: 'Algebra', node_id: 'm.quadratics', ordinal: 2, slot: 3, weight: 'core',
  level: 'Medium', prompt: `Prompt ${key}`, answer: 'Answer', hint: '', problems: [], subject: null,
  task_id: null, got: null, of: null, missed: null, ...over,
});

const queue = (over: Partial<ReviewQueue> = {}): ReviewQueue => ({
  due: [item('a'), item('b')], later: [], due_count: 2, later_count: 0, this_week: 0, next_due: null,
  cleared_lately: 0, minutes: 6, sitting: 2, ...over,
});

const draw = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('ReviewPanel', () => {
  beforeEach(() => {
    vi.mocked(reviewQueue).mockReset();
    vi.mocked(skillAttempts.add).mockReset();
  });

  it('lists what is due with how long it takes', async () => {
    vi.mocked(reviewQueue).mockResolvedValue({ success: true, ...queue() });
    draw(<ReviewPanel />);
    expect(await screen.findByText('Redo what you missed')).toBeInTheDocument();
    expect(screen.getByText('2 due · about 6 min')).toBeInTheDocument();
    expect(screen.getByText('Prompt a')).toBeInTheDocument();
  });

  it('counts down as you answer, without reading again', async () => {
    vi.mocked(reviewQueue).mockResolvedValue({ success: true, ...queue() });
    vi.mocked(skillAttempts.add).mockResolvedValue({ success: true, attempt: {} as never, levels: {} });
    const onChanged = vi.fn();
    draw(<ReviewPanel onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(await screen.findByText('1 due · about 3 min')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(reviewQueue).toHaveBeenCalledTimes(1);
  });

  it('says when the next one is back once caught up', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    vi.mocked(reviewQueue).mockResolvedValue({
      success: true,
      ...queue({ due: [], due_count: 0, later: [item('c', { state: 'later', due: iso })], later_count: 1, next_due: iso, cleared_lately: 2 }),
    });
    draw(<ReviewPanel />);
    expect(await screen.findByText("All caught up. The next one's back tomorrow. · 2 cleared lately")).toBeInTheDocument();
    expect(screen.getByText('Coming back (1)')).toBeInTheDocument();
  });

  it('draws nothing for an account that has never missed anything', async () => {
    vi.mocked(reviewQueue).mockResolvedValue({ success: true, ...queue({ due: [], due_count: 0, sitting: 0, minutes: 0 }) });
    const { container } = draw(<ReviewPanel />);
    await waitFor(() => expect(reviewQueue).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});

describe('dayWord', () => {
  it('says tomorrow, a weekday, or a date', () => {
    const today = new Date(2026, 9, 20);
    expect(dayWord('2026-10-21', today)).toBe('tomorrow');
    expect(dayWord('2026-10-23', today)).toBe('Friday');
    expect(dayWord('2026-11-02', today)).toBe('Nov 2');
  });
});

describe('SkillTreesPanel', () => {
  it('lists each practiced tree with what to do next, linked to the skill', async () => {
    vi.mocked(skillTrees).mockResolvedValue({
      success: true,
      trees: [{
        tree: 'algebra', title: 'Algebra', last: '2026-10-19', idle: 1, due: 2, practiced: 6, got: 3, skills: 40,
        top: {
          kind: 'harder', node_id: 'm.quadratics', node: 'Quadratics', from_id: null, ordinal: 2, weight: 'stretch',
          level_word: 'Hard', title: 'Try Hard problems on Factoring', because: 'You got 9 of 10 Medium right. Time to move up.',
          minutes: 20,
        },
      }],
    });
    draw(<SkillTreesPanel />);
    expect(await screen.findByText('Algebra: try Hard problems on Factoring')).toBeInTheDocument();
    expect(screen.getByText('Move up')).toBeInTheDocument();
    expect(screen.getByText('6 of 40 skills practiced · 3 solid · 2 to redo · practiced yesterday')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the tree' })).toHaveAttribute('href', '/skill-trees?node=m.quadratics');
  });

  it('draws nothing with no practice', async () => {
    vi.mocked(skillTrees).mockResolvedValue({ success: true, trees: [] });
    const { container } = draw(<SkillTreesPanel />);
    await waitFor(() => expect(skillTrees).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
