/**
 * The skill check screen, driven the way a reader drives it.
 *
 * The server is a small fake that grades like the real one: a number answer
 * comes back with a verdict, a sentence answer comes back as a reveal and then
 * waits for "Yes, I got it" or "No, I missed it", and "Show me the answer"
 * counts as missed. The grading itself is tested on the server
 * (tests/test_skill_progress.py); what is pinned here is the screen: one
 * question at a time, the verdict in the bar, the dots filling in, and the
 * results page with what a pass opened.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillCheck as Check, SkillReading } from '@/services/skillProgress';

const startCheck = vi.fn();
const answer = vi.fn();
vi.mock('@/services/skillProgress', () => ({
  startCheck: (...args: unknown[]) => startCheck(...args),
  answer: (...args: unknown[]) => answer(...args),
}));

import { SkillCheck } from './SkillCheck';

const ANSWERS = ['12.', 'Because 9 plus 1 carries.', '30.'];

function fresh(): Check {
  return {
    id: 'c1',
    node_id: 'm.arith',
    node_name: 'Arithmetic',
    asked: 3,
    need: 3,
    correct: 0,
    finished: false,
    passed: null,
    questions: [
      { index: 0, ordinal: 1, step: 'Add in columns', weight: 'core', prompt: 'What is 7 + 5?', hint: 'Count on from 7.', auto: true, result: null },
      { index: 1, ordinal: 2, step: 'Carrying', weight: 'stretch', prompt: 'Why does 19 + 1 make 20?', hint: '', auto: false, result: null },
      { index: 2, ordinal: 3, step: 'Times tables', weight: 'core', prompt: 'What is 5 x 6?', hint: '', auto: true, result: null },
    ],
  };
}

const READING: SkillReading = {
  status: { 'm.arith': 'complete' },
  nodes: {},
  unfiled: {},
  goals: {},
  checkable: ['m.arith'],
  targets: {},
};

/** A fake server: grades numbers, reveals sentences, finishes on the last. */
function serve(check: Check) {
  let state = check;
  answer.mockImplementation(async (body: { index: number; given?: string; mark?: string; skip?: boolean }) => {
    const question = state.questions[body.index]!;
    const expected = ANSWERS[body.index]!;
    let right: boolean;
    let how: string;
    if (body.skip) {
      right = false;
      how = 'skipped';
    } else if (question.auto) {
      right = String(parseFloat(body.given ?? '')) === String(parseFloat(expected));
      how = 'auto';
    } else if (body.mark) {
      right = body.mark === 'right';
      how = 'self';
    } else {
      return { success: true, check: state, reveal: { index: body.index, answer: expected, given: body.given } };
    }
    const questions = state.questions.map((one) =>
      one.index === body.index ? { ...one, result: { given: body.given ?? '', right, how, answer: expected } } : one,
    );
    const correct = questions.filter((one) => one.result?.right).length;
    const finished = questions.every((one) => one.result);
    state = { ...state, questions, correct, finished, passed: finished ? correct >= state.need : null };
    return {
      success: true,
      check: state,
      result: { index: body.index, right, how, answer: expected },
      ...(finished ? { progress: READING, opened: state.passed ? [{ id: 'm.order', name: 'Order of Operations' }] : [] } : {}),
    };
  });
}

beforeEach(() => {
  startCheck.mockReset();
  answer.mockReset();
});

async function open(check = fresh()) {
  startCheck.mockResolvedValue({ success: true, check, resumed: false });
  serve(check);
  const onClose = vi.fn();
  const onProgress = vi.fn();
  render(<SkillCheck nodeId="m.arith" nodeName="Arithmetic" onClose={onClose} onProgress={onProgress} />);
  await screen.findByText('What is 7 + 5?');
  return { onClose, onProgress };
}

const type = (text: string) => fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: text } });
const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('the skill check', () => {
  it('asks one question at a time and keeps Check off until something is typed', async () => {
    await open();
    expect(screen.queryByText('Why does 19 + 1 make 20?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    type('12');
    expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled();
    expect(screen.getByText('Get 3 of 3 right to master it.')).toBeInTheDocument();
  });

  it('shows a hint only when asked', async () => {
    await open();
    expect(screen.queryByText('Count on from 7.')).toBeNull();
    await press('Get a hint');
    expect(screen.getByText('Count on from 7.')).toBeInTheDocument();
  });

  it('grades a number straight away and fills in its dot', async () => {
    await open();
    type('12');
    await press('Check');
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(answer).toHaveBeenCalledWith({ id: 'c1', index: 0, given: '12' });
    expect(screen.getByRole('list', { name: '1 of 3 answered' }).children[0]).toHaveClass('is-right');
  });

  it('says what the answer was after a miss', async () => {
    await open();
    type('13');
    await press('Check');
    expect(screen.getByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByText(/The answer: 12\./)).toBeInTheDocument();
  });

  it('shows the worked answer for a sentence and asks whether it matched', async () => {
    await open();
    type('12');
    await press('Check');
    await press('Next question');
    expect(screen.getByText('Why does 19 + 1 make 20?')).toBeInTheDocument();
    type('the ones roll over');
    await press('Check');
    expect(screen.getByText("Here's the worked answer")).toBeInTheDocument();
    expect(screen.getByText('Because 9 plus 1 carries.')).toBeInTheDocument();
    await press('Yes, I got it');
    expect(answer).toHaveBeenLastCalledWith({ id: 'c1', index: 1, given: 'the ones roll over', mark: 'right' });
    expect(screen.getByText('Nice, that counts.')).toBeInTheDocument();
  });

  it('counts "Show me the answer" as missed', async () => {
    await open();
    await press('Show me the answer');
    expect(answer).toHaveBeenCalledWith({ id: 'c1', index: 0, skip: true });
    expect(screen.getByText("Here's how it goes.")).toBeInTheDocument();
  });

  it('ends on the results, says what a pass opened and hands the reading to the page', async () => {
    const { onProgress } = await open();
    type('12');
    await press('Check');
    await press('Next question');
    type('carrying');
    await press('Check');
    await press('Yes, I got it');
    await press('Next question');
    type('30');
    await press('Check');
    expect(onProgress).toHaveBeenCalledWith(READING);
    await press('See results');
    expect(screen.getByText('You mastered Arithmetic!')).toBeInTheDocument();
    expect(screen.getByText('Order of Operations')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try a new check' })).toBeNull();
  });

  it('offers a new check after a fail', async () => {
    await open();
    await press('Show me the answer');
    await press('Next question');
    await press('Show me the answer');
    await press('Next question');
    await press('Show me the answer');
    await press('See results');
    expect(screen.getByText('Not yet.')).toBeInTheDocument();
    expect(screen.getByText(/0 of 3 right, and you need 3 to pass/)).toBeInTheDocument();
    startCheck.mockResolvedValue({ success: true, check: { ...fresh(), id: 'c2' }, resumed: false });
    await press('Try a new check');
    await waitFor(() => expect(startCheck).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('What is 7 + 5?')).toBeInTheDocument();
  });

  it('picks up a running check at the first unanswered question', async () => {
    const running = fresh();
    running.questions[0] = { ...running.questions[0]!, result: { given: '12', right: true, how: 'auto', answer: '12.' } };
    startCheck.mockResolvedValue({ success: true, check: running, resumed: true });
    serve(running);
    render(<SkillCheck nodeId="m.arith" nodeName="Arithmetic" onClose={vi.fn()} />);
    expect(await screen.findByText('Why does 19 + 1 make 20?')).toBeInTheDocument();
    expect(screen.getByText('Picked up where you left off.')).toBeInTheDocument();
  });

  it('says why when the check cannot start', async () => {
    startCheck.mockResolvedValue({ success: false, message: 'This skill is still locked. Finish what comes before it first.' });
    render(<SkillCheck nodeId="m.order" nodeName="Order of Operations" onClose={vi.fn()} />);
    expect(await screen.findByText(/still locked/)).toBeInTheDocument();
  });

  it('closes on Escape and on the close button', async () => {
    const { onClose } = await open();
    fireEvent.keyDown(window, { key: 'Escape' });
    await press('Close the check');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
