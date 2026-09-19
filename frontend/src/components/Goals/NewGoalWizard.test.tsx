/**
 * The subject a goal is filed under, on the way in.
 *
 * `subject_ids` is the only link between a goal and the record of the work
 * being done toward it — the subject page reads it to find the goals it is
 * for, the analytics Goals tab reads it to split goals by subject, and
 * utils/goalSuggest reads it to know which goal a new task belongs to. It was
 * optional and was not asked for at all, so every goal in the account had an
 * empty one and every one of those readings came back empty.
 *
 * That is the failure worth a test: it was not a crash, it was three features
 * quietly having no input, and nothing on any screen said why they were blank.
 * What is pinned here is that the wizard will not let a goal out without one.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { NewGoalWizard } from './NewGoalWizard';
import type { NewGoalWizardProps } from './NewGoalWizard';
import type { Subject } from '@/services/subjects';

type Suggest = NonNullable<NewGoalWizardProps['onSuggest']>;

const SUBJECTS = [
  { id: 'algebra', name: 'Algebra', label: 'Algebra', icon: 'algebra', group: 'Maths and science', custom: false },
  { id: 'violin', name: 'Violin', label: 'Violin', icon: 'violin', group: 'Arts', custom: false },
] as unknown as Subject[];

function show(onSave = vi.fn()) {
  renderWithProviders(
    <NewGoalWizard open busy={false} subjects={SUBJECTS} onClose={vi.fn()} onSave={onSave} />,
  );
  return onSave;
}

/* Exact, not `/next/i`: the "By checkpoints" card on step four is a button
   whose text contains "the next step is where you list them". */
const next = () => screen.getByRole('button', { name: 'Next' });

describe('the subject on a new goal', () => {
  it('will not go past the first step without one', async () => {
    // A title alone used to be enough, and a title alone is what most goals
    // arrived with.
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText(/the outcome, not the activity/i), 'Get 24 on the AMC 8');
    expect(next()).toBeDisabled();
  });

  it('goes on once one is picked', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText(/the outcome, not the activity/i), 'Get 24 on the AMC 8');
    await user.click(screen.getByRole('button', { name: /choose a subject/i }));
    await user.click(screen.getByRole('button', { name: 'Algebra' }));

    expect(next()).toBeEnabled();
  });

  it('still refuses a subject with no title', async () => {
    // The subject is an addition to the gate, not a replacement for it.
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: /choose a subject/i }));
    await user.click(screen.getByRole('button', { name: 'Algebra' }));

    expect(next()).toBeDisabled();
  });

  it('says the field is required rather than leaving it looking optional', async () => {
    // The picker's default word is "optional", which is true of a task and
    // false here — and a control that says optional next to a disabled Next
    // button is the dialog contradicting itself.
    show();
    expect(screen.getByText('required')).toBeInTheDocument();
  });

  it('sends the chosen subject to the server', async () => {
    // The whole point. A goal that saves without this reaches the database
    // with an empty `subject_ids` and is invisible to its own subject's page.
    const user = userEvent.setup();
    const onSave = show();

    await user.type(screen.getByLabelText(/the outcome, not the activity/i), 'Violin ARCT');
    await user.click(screen.getByRole('button', { name: /choose a subject/i }));
    await user.click(screen.getByRole('button', { name: 'Violin' }));

    // Straight to the end: every other step is skippable and says so.
    for (let step = 0; step < 5; step += 1) await user.click(next());
    await user.click(screen.getByRole('button', { name: 'Create goal' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Violin ARCT', subject_ids: 'violin' }),
    );
  });
});

describe('the model on the checkpoints step', () => {
  const DRAFT = ['Grade 8 repertoire secure', 'Etudes at tempo', 'Concerto memorised',
    'Mock exam passed', 'ARCT performance passed'];

  async function toCheckpoints(onSuggest: Suggest) {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <NewGoalWizard
        open
        busy={false}
        subjects={SUBJECTS}
        onClose={vi.fn()}
        onSave={onSave}
        onSuggest={onSuggest}
      />,
    );
    await user.type(screen.getByLabelText(/the outcome, not the activity/i), 'Violin ARCT');
    await user.click(screen.getByRole('button', { name: /choose a subject/i }));
    await user.click(screen.getByRole('button', { name: 'Violin' }));
    await user.click(next());
    await user.type(screen.getByLabelText(/why this one/i), 'Teach one day');
    for (let step = 1; step < 4; step += 1) await user.click(next());
    return { user, onSave };
  }

  it('drafts the checkpoints from what the wizard collected, and sends them with the goal', async () => {
    const onSuggest = vi.fn<Suggest>().mockResolvedValue({ milestones: DRAFT });
    const { user, onSave } = await toCheckpoints(onSuggest);

    await user.click(screen.getByRole('button', { name: 'Suggest with AI' }));

    expect(onSuggest).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Violin ARCT', why: 'Teach one day', deadline: expect.any(String) }),
    );
    expect(await screen.findByText('Concerto memorised')).toBeInTheDocument();

    await user.click(next());
    await user.click(screen.getByRole('button', { name: 'Create goal' }));
    // The list the reader saw is the list the goal gets.
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ milestones: DRAFT }));
  });

  it('says why when nothing could be drafted', async () => {
    const onSuggest = vi.fn<Suggest>().mockResolvedValue({ problem: 'Milestone suggestions need a model key.' });
    const { user } = await toCheckpoints(onSuggest);

    await user.click(screen.getByRole('button', { name: 'Suggest with AI' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('need a model key');
  });
});

describe('the chart step', () => {
  it('asks which chart the card should draw, and sends the answer with the goal', async () => {
    const user = userEvent.setup();
    const onSave = show();

    await user.type(screen.getByLabelText(/the outcome, not the activity/i), 'Violin ARCT');
    await user.click(screen.getByRole('button', { name: /choose a subject/i }));
    await user.click(screen.getByRole('button', { name: 'Violin' }));
    for (let step = 0; step < 5; step += 1) await user.click(next());

    expect(screen.getByRole('heading', { name: 'How should it look?' })).toBeInTheDocument();
    // Automatic is where it starts.
    expect(screen.getByRole('radio', { name: /Automatic/ })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: /Heatmap/ }));
    await user.click(screen.getByRole('button', { name: 'Create goal' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ chart: 'heatmap' }));
  });
});
