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
import { NOTHING, type Levels, type SkillLevel, type StepLevels } from '@/utils/skillLevel';

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

/** A step's readings, the way `/api/skill-attempts` sends them. The level rule
    is backend/tracking/skill_level.py, tested there. */
function step(level: SkillLevel['level'], attempted: number): StepLevels {
  const now: SkillLevel = {
    ...NOTHING,
    level,
    attempted,
    correct: attempted - 1,
    accuracy: 83,
    hardest: level >= 4 ? 'stretch' : 'warmup',
    mastery: level * 20,
    lastAt: '2026-09-28T10:00:00',
    evidence: 'solid',
  };
  return { now, before: NOTHING, attempted };
}

let levels: Levels = {};

function draw() {
  render(
    <MemoryRouter>
      <SkillLevelsPanel
        practice={{ attempts: [], levels, loading: false, error: null }}
        periodText="your whole record"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  levels = {};
});

describe('skills by level', () => {
  it('prints the step, its level, and how far it has come from nothing', async () => {
    levels = { 'm.quadratics#3': step(4, 16) };
    draw();

    expect(await screen.findByText('Factor Simple Quadratics')).toBeInTheDocument();
    expect(screen.getByText(/Quadratics · step 3 of 7/)).toBeInTheDocument();
    expect(screen.getByText('Level 0')).toBeInTheDocument();
    expect(screen.getByText('Level 4')).toBeInTheDocument();
    expect(screen.getByText('Not started → Hard')).toBeInTheDocument();
    expect(screen.getByText(/16 problems/)).toBeInTheDocument();
  });

  it('leaves out a step with nothing answered on it', async () => {
    levels = { 'm.quadratics#3': step(0, 0) };
    draw();
    expect(await screen.findByText(/No skill-tree problems marked in your whole record/))
      .toBeInTheDocument();
  });

  it('tells a reader with nothing marked how to start', async () => {
    draw();
    expect(await screen.findByRole('link', { name: 'Skill Tree' })).toHaveAttribute('href', '/skill-trees');
    expect(screen.getByText(/not from time spent/)).toBeInTheDocument();
  });
});
