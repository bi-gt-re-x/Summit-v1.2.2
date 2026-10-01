/**
 * Skills by level, on the Growth tab: the line the feature was asked for.
 *
 *     Factor Simple Quadratics     Level 2 → Level 4
 *     68% → 91% accuracy · Easy → Hard problems
 *
 * What is pinned is that the line is built from marked problems, filed under
 * the step's real title, scoped to the period — and that a reader with nothing
 * marked is told how to start rather than shown an empty box.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attempt } from '@/services/skillAttempts';

let reply: Attempt[] = [];

vi.mock('@/services/skillSteps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/skillSteps')>()),
  loadSteps: vi.fn(async () => ({
    'm.quadratics': [1, 2, 3, 4, 5, 6, 7].map((ordinal) => ({
      ordinal,
      title: ordinal === 3 ? 'Factor Simple Quadratics' : `Step ${ordinal}`,
    })),
  })),
}));

const { SkillLevelsPanel } = await import('./SkillLevels');

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
/** Local time `daysAgo` days back, as the server writes it. */
function ago(daysAgo: number, minute = 0): string {
  const d = new Date(Date.now() - daysAgo * DAY);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:${pad(minute)}:00`;
}

let seq = 0;
function marks(weight: Attempt['weight'], count: number, right: number, daysAgo: number): Attempt[] {
  return Array.from({ length: count }, (_, i) => {
    seq += 1;
    return {
      id: String(seq), node_id: 'm.quadratics', ordinal: 3, slot: 1, weight,
      attempted: 1, correct: i < right ? 1 : 0, source: 'problem' as const, at: ago(daysAgo, i),
    };
  });
}

function draw(windowDays: number | null = 30) {
  render(
    <MemoryRouter>
      <SkillLevelsPanel
        practice={{ attempts: reply, loading: false, error: null }}
        windowDays={windowDays}
        periodText="the last 30 days"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reply = [];
});

describe('skills by level', () => {
  it('prints the step, its level then and now, and what moved', async () => {
    reply = [
      // Before the period: Easy cleared, Medium tried — level 2.
      ...marks('warmup', 6, 5, 60),
      ...marks('core', 4, 2, 60),
      // Inside it: Hard problems, mostly right — level 4.
      ...marks('stretch', 6, 5, 5),
    ];
    draw();

    expect(await screen.findByText('Factor Simple Quadratics')).toBeInTheDocument();
    expect(screen.getByText(/Quadratics · step 3 of 7/)).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    expect(screen.getByText('Level 4')).toBeInTheDocument();
    expect(screen.getByText('Easy → Hard')).toBeInTheDocument();
    expect(screen.getByText(/moved up a level/)).toBeInTheDocument();
    expect(screen.getByText(/6 problems/)).toBeInTheDocument();
  });

  it('leaves out a skill nobody touched inside the period', async () => {
    reply = marks('warmup', 6, 6, 90);
    draw();
    expect(await screen.findByText(/No skill-tree problems marked in the last 30 days/))
      .toBeInTheDocument();
  });

  it('tells a reader with nothing marked how to start', async () => {
    draw();
    expect(await screen.findByRole('link', { name: 'Skill Tree' })).toHaveAttribute('href', '/skill-trees');
    expect(screen.getByText(/not from time spent/)).toBeInTheDocument();
  });
});
