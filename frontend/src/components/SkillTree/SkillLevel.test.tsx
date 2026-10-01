/**
 * Measuring a skill in the panel: marking problems, logging work, and the
 * level that comes out.
 *
 * The behaviour worth pinning is the loop — a mark below changes the card
 * above — and the ways a mark can be wrong and has to be cheap to fix: pressed
 * twice, pressed on the wrong button, or typed as "15 right out of 10". The
 * arithmetic of the level itself is utils/skillLevel.test.ts.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LatticePanel } from './LatticePanel';
import type { WrittenStep } from '@/services/skillSteps';
import type { Attempt, NewAttempt } from '@/services/skillAttempts';
import type { GraphNode, SkillGraph } from '@/utils/skillGraph';

function step(ordinal: number, title: string, withProblems = false): WrittenStep {
  return {
    ordinal,
    title,
    mastery: `Mastery of ${title}.`,
    practice: `Practise ${title}.`,
    detail: `How to ${title}.`,
    proof: `Proof for ${title}.`,
    pitfall: `Trap in ${title}.`,
    minutes: 15,
    problems: withProblems
      ? [
          { slot: 1, weight: 'warmup', prompt: 'Factor x^2 + 5x + 6.', answer: '(x + 2)(x + 3)', hint: '' },
          { slot: 2, weight: 'core', prompt: 'Factor x^2 - 7x + 12.', answer: '(x - 3)(x - 4)', hint: '' },
          { slot: 3, weight: 'stretch', prompt: 'Factor x^2 - x - 42.', answer: '(x - 7)(x + 6)', hint: '' },
        ]
      : [],
    verified: { at: '2026-09-26T12:00:00', by: 'rules', checks: ['shape'], model: 'authored', attempts: 1 },
  };
}

const PROGRAMME = [
  step(1, 'Recognise a Quadratic'),
  step(2, 'Expand Binomials'),
  step(3, 'Factor Simple Quadratics', true),
];

const picked: GraphNode = {
  id: 'm.quadratics', name: 'Quadratics', blurb: 'About quadratics.', category: 'Maths',
  difficulty: 'intermediate', status: 'available', percent: 0, xp: 1000, have: 0, need: 1000,
  unit: 'XP', on: '', requires: [], gate: '',
};

const pad = (n: number) => String(n).padStart(2, '0');
const localStamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** The panel over a real list of attempts, so a write shows up as it would on the page. */
function Harness({
  written,
  initial = [],
  onAttempt,
  onUndo,
}: {
  written: WrittenStep[] | null;
  initial?: Attempt[];
  onAttempt: (attempt: NewAttempt) => void;
  onUndo: (id: string) => void;
}) {
  const [attempts, setAttempts] = useState<Attempt[]>(initial);
  const graph: SkillGraph = { id: 'mathematics', name: 'Mathematics', nodes: [picked] };
  return (
    <LatticePanel
      graph={graph}
      node={picked}
      onSelect={vi.fn()}
      written={written}
      evidence={{
        attempts,
        onAttempt: async (attempt) => {
          onAttempt(attempt);
          const made: Attempt = {
            ...attempt,
            id: String(attempts.length + Math.random()),
            // Local time without a zone, which is what the server writes. A
            // UTC stamp here would read as the future west of Greenwich, and
            // a level never counts what has not happened yet.
            at: localStamp(new Date(Date.now() - 1000)),
          };
          setAttempts((was) => [...was, made]);
          return made;
        },
        onUndo: async (id) => {
          onUndo(id);
          setAttempts((was) => was.filter((row) => row.id !== id));
          return true;
        },
      }}
    />
  );
}

function draw(written: WrittenStep[] | null = PROGRAMME, initial: Attempt[] = []) {
  const onAttempt = vi.fn();
  const onUndo = vi.fn();
  render(<Harness written={written} initial={initial} onAttempt={onAttempt} onUndo={onUndo} />);
  return { onAttempt, onUndo };
}

async function openFactoring(user: ReturnType<typeof userEvent.setup>) {
  const chain = document.querySelector('.slv-chain') as HTMLElement;
  await user.click(within(chain).getByRole('button', { name: /Factor Simple Quadratics/ }));
}

describe('the chain of steps', () => {
  it('lists every step with its level, in order', () => {
    draw();
    expect(screen.getByText('Your level, step by step')).toBeInTheDocument();
    const steps = document.querySelectorAll('.slv-chain-step');
    expect([...steps].map((li) => li.querySelector('.slv-chain-title')?.textContent)).toEqual([
      'Recognise a Quadratic', 'Expand Binomials', 'Factor Simple Quadratics',
    ]);
    expect(screen.getByText(/No step practised yet/)).toBeInTheDocument();
  });

  it('is not drawn without evidence to read', () => {
    const graph: SkillGraph = { id: 'mathematics', name: 'Mathematics', nodes: [picked] };
    render(<LatticePanel graph={graph} node={picked} onSelect={vi.fn()} written={PROGRAMME} />);
    expect(screen.queryByText('Your level, step by step')).not.toBeInTheDocument();
  });
});

describe('marking a problem', () => {
  it('asks how it went only once the answer is out', async () => {
    const user = userEvent.setup();
    draw();
    await openFactoring(user);
    expect(screen.getByText('Level 0')).toBeInTheDocument();
    expect(screen.queryByText('How did it go?')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Show answer' })[0]!);
    expect(screen.getByText('How did it go?')).toBeInTheDocument();
  });

  it('stores a mark against the step and the problem, and the card moves', async () => {
    const user = userEvent.setup();
    const { onAttempt } = draw();
    await openFactoring(user);
    await user.click(screen.getAllByRole('button', { name: 'Show answer' })[1]!);
    await user.click(screen.getByRole('button', { name: '✓ Got it' }));

    expect(onAttempt).toHaveBeenCalledWith({
      node_id: 'm.quadratics', ordinal: 3, slot: 2, weight: 'core',
      attempted: 1, correct: 1, source: 'problem',
    });
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✓ Got it' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('takes a mark back when the same button is pressed again', async () => {
    const user = userEvent.setup();
    const { onUndo } = draw();
    await openFactoring(user);
    await user.click(screen.getAllByRole('button', { name: 'Show answer' })[0]!);
    await user.click(screen.getByRole('button', { name: '✓ Got it' }));
    await user.click(screen.getByRole('button', { name: '✓ Got it' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Level 0')).toBeInTheDocument();
  });

  it('replaces rather than adds when the other button is pressed', async () => {
    const user = userEvent.setup();
    const { onAttempt, onUndo } = draw();
    await openFactoring(user);
    await user.click(screen.getAllByRole('button', { name: 'Show answer' })[0]!);
    await user.click(screen.getByRole('button', { name: '✓ Got it' }));
    await user.click(screen.getByRole('button', { name: '✗ Missed it' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenLastCalledWith(expect.objectContaining({ slot: 1, correct: 0 }));
    // One attempt on the record, not two.
    expect(screen.getByText(/0 right/)).toBeInTheDocument();
  });
});

describe('logging work from elsewhere', () => {
  it('refuses more right than attempted before sending anything', async () => {
    const user = userEvent.setup();
    const { onAttempt } = draw();
    await openFactoring(user);
    await user.type(screen.getByLabelText('Problems attempted'), '10');
    await user.type(screen.getByLabelText('Problems right'), '15');
    await user.click(screen.getByRole('button', { name: 'Log' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Between 0 and 10/);
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('logs a batch against the step, and it counts', async () => {
    const user = userEvent.setup();
    const { onAttempt } = draw();
    await openFactoring(user);
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'Hard');
    await user.type(screen.getByLabelText('Problems attempted'), '8');
    await user.type(screen.getByLabelText('Problems right'), '7');
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(onAttempt).toHaveBeenCalledWith({
      node_id: 'm.quadratics', ordinal: 3, weight: 'stretch',
      attempted: 8, correct: 7, source: 'log',
    });
    // Eight Hard at 88%: Hard is cleared, so level 4.
    expect(screen.getByText('Level 4')).toBeInTheDocument();
  });

  it('falls back to the skill as a whole where nothing is written', async () => {
    const user = userEvent.setup();
    const { onAttempt } = draw(null);
    expect(screen.getByText(/no written problems yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Problems attempted'), '5');
    await user.type(screen.getByLabelText('Problems right'), '5');
    await user.click(screen.getByRole('button', { name: 'Log' }));
    expect(onAttempt).toHaveBeenCalledWith(expect.objectContaining({ ordinal: 0, source: 'log' }));
  });
});
