/**
 * "Draft it all" — one sentence in, four of the wizard's five steps out.
 *
 * The checkpoint drafting on the last step starts from a goal the reader has
 * already shaped. This starts before that, and the property worth pinning is
 * what it deliberately does *not* fill in: the subject.
 *
 * The subject is the only field this wizard refuses to proceed without, it is
 * chosen from the account's own followed subjects, and a model guessing which
 * of *your* subjects a goal belongs to is a guess that would be silently
 * wrong — the goal would save, and half the app would quietly be reading the
 * wrong record against it. So the draft fills everything else and leaves the
 * step blocked until the reader answers.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewGoalWizard } from './NewGoalWizard';
import type { NewGoalWizardProps, WholeGoalDraft } from './NewGoalWizard';
import type { Subject } from '@/services/subjects';

const subjects = [
  { id: 'algebra', name: 'Algebra' },
  { id: 'geometry', name: 'Geometry' },
] as unknown as Subject[];

const DRAFTED: WholeGoalDraft = {
  goal: {
    title: 'Reach USACO Gold',
    why: 'It is what the summer programmes ask for.',
    category: 'coding',
    deadline: '2027-04-01',
    milestones: ['Bronze unassisted', 'Silver DP unassisted', 'Gold reached'],
  },
};

function show(over: Partial<NewGoalWizardProps> = {}) {
  const props = {
    open: true,
    busy: false,
    subjects,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onDraft: vi.fn(async () => DRAFTED),
    ...over,
  } satisfies NewGoalWizardProps;
  render(<NewGoalWizard {...props} />);
  return props;
}

const ideaBox = () => screen.getByLabelText(/not sure how to phrase it/i);
const draftBtn = () => screen.getByRole('button', { name: /draft it all/i });

/** The picker is a disclosure and a list of names, not a <select>. */
async function pickSubject(name: string) {
  await userEvent.click(screen.getByRole('button', { name: /choose a subject/i }));
  await userEvent.click(screen.getByRole('button', { name }));
}

describe('the offer itself', () => {
  it('is there when the page passed a drafter', () => {
    show();
    expect(draftBtn()).toBeInTheDocument();
  });

  /** No key configured, no button — the wizard is the form it always was. */
  it('is absent when the page passed none', () => {
    show({ onDraft: undefined });
    expect(screen.queryByRole('button', { name: /draft it all/i })).not.toBeInTheDocument();
  });

  it('will not fire on an empty box', () => {
    show();
    expect(draftBtn()).toBeDisabled();
  });
});

describe('what a draft fills in', () => {
  it('sends the sentence and writes the title back', async () => {
    const props = show();
    await userEvent.type(ideaBox(), 'get good at usaco');
    await userEvent.click(draftBtn());

    expect(props.onDraft).toHaveBeenCalledWith('get good at usaco');
    await waitFor(() =>
      expect(screen.getByLabelText(/the outcome, not the activity/i)).toHaveValue(
        'Reach USACO Gold',
      ),
    );
  });

  it('carries the reason and the checkpoints through to their own steps', async () => {
    show();
    await userEvent.type(ideaBox(), 'usaco');
    await userEvent.click(draftBtn());
    await waitFor(() =>
      expect(screen.getByLabelText(/the outcome/i)).toHaveValue('Reach USACO Gold'),
    );

    // The subject is still unanswered, so the step is still blocked — which is
    // the point of the next test. Answer it, then walk to the later steps.
    await pickSubject('Algebra');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByLabelText(/why this one/i)).toHaveValue(
      'It is what the summer programmes ask for.',
    );
  });
});

describe('what it deliberately leaves alone', () => {
  it('does not pick a subject, and the step stays blocked until you do', async () => {
    show();
    await userEvent.type(ideaBox(), 'usaco');
    await userEvent.click(draftBtn());
    await waitFor(() =>
      expect(screen.getByLabelText(/the outcome/i)).toHaveValue('Reach USACO Gold'),
    );

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    await pickSubject('Algebra');
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });
});

describe('when the model cannot', () => {
  it('says so where the button is, and fills nothing', async () => {
    show({ onDraft: vi.fn(async () => ({ problem: 'No key configured.' })) });
    await userEvent.type(ideaBox(), 'usaco');
    await userEvent.click(draftBtn());

    expect(await screen.findByRole('alert')).toHaveTextContent('No key configured.');
    expect(screen.getByLabelText(/the outcome/i)).toHaveValue('');
  });
});

/**
 * Which box the caret lands in, which is the whole difference between the
 * page's two doors into this wizard.
 *
 * "+ New Goal" and "Draft a goal" open the same wizard on the same step. The
 * offer has been on that step since it was built and nobody found it, because
 * a button promising a form is not somewhere a reader goes looking for a way
 * to skip the form. Naming the second door only helps if pressing it does not
 * then hand them the form anyway.
 */
describe('which field opens focused', () => {
  it('is the title, when the wizard was opened to fill one in', () => {
    show();
    expect(screen.getByLabelText(/the outcome, not the activity/i)).toHaveFocus();
  });

  it('is the sentence box, when it was opened to draft', () => {
    show({ focusIdea: true });
    expect(ideaBox()).toHaveFocus();
  });

  it('and drafting still works from there', async () => {
    const props = show({ focusIdea: true });
    await userEvent.type(ideaBox(), 'usaco gold');
    await userEvent.click(draftBtn());
    expect(props.onDraft).toHaveBeenCalledWith('usaco gold');
  });
});
