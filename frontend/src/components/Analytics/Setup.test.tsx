/**
 * The question phase, and the two promises it makes.
 *
 * **One write, at the end.** Eight screens, two stores, and an account that
 * closed the tab on step three should be exactly as unconfigured as one that
 * never opened the page. That is a property of the whole flow rather than of
 * any one step, so it is checked by walking the flow.
 *
 * **The count is the steps that exist.** The two subject questions are dropped
 * on an account with no subjects, and the rail and the "Step n of m" have to
 * agree with that — a flow that says "Step 4 of 8" and then finishes on 6 is
 * the failure a hard-coded length produces, and it is invisible to the
 * compiler.
 *
 * **The follow list is capped and it is ordered.** Four is the most, the cap
 * is held by the buttons rather than by silently dropping a pick, and the
 * order is the reader's own because the rail draws the menu in it.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsSetup } from './Setup';
import { DEFAULTS } from '@/services/settings';
import type { SetupAnswers, SetupPrefs } from './Setup';

const PREFS: SetupPrefs = {
  analytics_log_style: DEFAULTS.analytics_log_style,
  analytics_tone: DEFAULTS.analytics_tone,
  analytics_detail: DEFAULTS.analytics_detail,
  analytics_home_tab: DEFAULTS.analytics_home_tab,
  analytics_subjects: DEFAULTS.analytics_subjects,
  analytics_subject_depth: DEFAULTS.analytics_subject_depth,
  analytics_ambitions: DEFAULTS.analytics_ambitions,
};

const SUBJECTS = [{ id: 'maths', label: 'Mathematics' }];

/** Enough subjects to reach the cap and try to pass it. */
const MANY = [
  { id: 'maths', label: 'Mathematics' },
  { id: 'physics', label: 'Physics' },
  { id: 'chem', label: 'Chemistry' },
  { id: 'bio', label: 'Biology' },
  { id: 'history', label: 'History' },
];

/* Typed against the prop rather than inferred from the arrow: `vi.fn(async ()
   => true)` infers a nullary mock, and `mock.calls[0][0]` on one of those is a
   type error even though the call is real. */
function saver() {
  return vi.fn<(answers: SetupAnswers) => Promise<boolean>>(async () => true);
}

function draw(over: Partial<React.ComponentProps<typeof AnalyticsSetup>> = {}) {
  const onSave = saver();
  render(<AnalyticsSetup subjects={SUBJECTS} prefs={PREFS} onSave={onSave} {...over} />);
  return { onSave };
}

/** Walk to the last step. The flow is linear, so this is just Next until the
 *  finish button appears. */
async function toTheEnd(user: ReturnType<typeof userEvent.setup>) {
  for (let step = 0; step < 10; step += 1) {
    const next = screen.queryByRole('button', { name: 'Next' });
    if (!next) return;
    await user.click(next);
  }
}

describe('the analytics question phase', () => {
  it('asks eight with a catalog and six without', () => {
    const { unmount } = render(
      <AnalyticsSetup subjects={SUBJECTS} prefs={PREFS} onSave={saver()} />,
    );
    expect(screen.getByText(/Step 1 of 8/)).toBeInTheDocument();
    unmount();

    render(<AnalyticsSetup subjects={[]} prefs={PREFS} onSave={saver()} />);
    expect(screen.getByText(/Step 1 of 6/)).toBeInTheDocument();
  });

  it('writes nothing until the last step', async () => {
    const user = userEvent.setup();
    const { onSave } = draw();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sends the baseline and the preferences together', async () => {
    const user = userEvent.setup();
    const { onSave } = draw();

    // Step one: how work is recorded.
    await user.click(screen.getByRole('button', { name: /Sessions/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step two: days a week.
    await user.click(screen.getByRole('button', { name: '3' }));

    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const answers = onSave.mock.calls[0]![0];
    expect(answers.baseline.active_days).toBe(3);
    expect(answers.prefs.analytics_log_style).toBe('sessions');
    // Untouched questions still travel, at the value they were shown at —
    // a partial write would leave the page half-configured.
    expect(answers.prefs.analytics_tone).toBe(DEFAULTS.analytics_tone);
    // The week is what was asked for and it did not move: five hours, now
    // over three days rather than five, which is a hundred-minute sitting.
    expect(answers.baseline.session_minutes).toBe(100);
  });

  it('takes the week in hours and stores the sitting it comes to', async () => {
    const user = userEvent.setup();
    const { onSave } = draw();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const field = screen.getByRole('spinbutton', { name: /hours a week/i });
    await user.clear(field);
    await user.type(field, '10');
    // The sitting is derived and printed rather than asked for: ten hours
    // over four days is two and a half.
    expect(screen.getByText(/2h 30m/)).toBeInTheDocument();

    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));

    const answers = onSave.mock.calls[0]![0];
    expect(answers.baseline.active_days).toBe(4);
    expect(answers.baseline.session_minutes).toBe(150);
  });

  it('holds the sitting inside what the server will take', async () => {
    const user = userEvent.setup();
    const { onSave } = draw();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const field = screen.getByRole('spinbutton', { name: /hours a week/i });
    await user.clear(field);
    await user.type(field, '40');
    // Forty hours on one day is a forty-hour sitting, which the server would
    // refuse. It is clamped, and the screen says so rather than saving
    // something the reader was never shown.
    expect(screen.getByText(/that is what is stored/i)).toBeInTheDocument();

    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));

    expect(onSave.mock.calls[0]![0].baseline.session_minutes).toBe(480);
  });

  it('can be left from any step, not only the first', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    draw({ onSkip });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: /skip the rest/i }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('opens on the answers already given when it is an edit', async () => {
    const user = userEvent.setup();
    draw({
      current: { active_days: 2, session_minutes: 25, focus_subject: 'maths' },
      setOn: '2026-08-01',
      onSkip: vi.fn(),
    });
    expect(screen.getByText(/Your answers/)).toBeInTheDocument();
    // And the way out is a cancel rather than a skip: there is nothing to skip
    // past, the page underneath is already configured.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skip the rest/i })).not.toBeInTheDocument();

    // The questions still have their answers in them — the reader came back to
    // change one, not to start again.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: '2', pressed: true })).toBeInTheDocument();

    // Including the week, which is the stored pair read back the way it is
    // asked: two days of 25 minutes is 0.8 of an hour.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('spinbutton', { name: /hours a week/i })).toHaveValue(0.8);
  });

  /** Walk to the subjects question — the fourth screen, after log, days and
   *  hours. Written as clicks rather than as an index so that adding a step
   *  before it fails here loudly instead of testing the wrong screen. */
  async function toSubjects(user: ReturnType<typeof userEvent.setup>) {
    for (let step = 0; step < 3; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
  }

  it('sends the followed subjects in the order they were picked', async () => {
    const user = userEvent.setup();
    const onSave = saver();
    render(<AnalyticsSetup subjects={MANY} prefs={PREFS} onSave={onSave} />);

    await toSubjects(user);
    // Out of order on purpose: the stored order is the reader's, not the
    // catalogue's, because the rail draws the menu in it.
    await user.click(screen.getByRole('button', { name: /Chemistry/ }));
    await user.click(screen.getByRole('button', { name: /Mathematics/ }));

    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));

    expect(onSave.mock.calls[0]![0].prefs.analytics_subjects).toEqual(['chem', 'maths']);
  });

  it('stops at four rather than quietly dropping the oldest pick', async () => {
    const user = userEvent.setup();
    const onSave = saver();
    render(<AnalyticsSetup subjects={MANY} prefs={PREFS} onSave={onSave} />);

    await toSubjects(user);
    for (const name of [/Mathematics/, /Physics/, /Chemistry/, /Biology/]) {
      await user.click(screen.getByRole('button', { name }));
    }

    // The fifth is not merely ignored — it is visibly unavailable, so the cap
    // is something the reader can see rather than something they discover by
    // clicking and having nothing happen.
    const fifth = screen.getByRole('button', { name: /History/ });
    expect(fifth).toBeDisabled();
    await user.click(fifth);

    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));

    // The first four, and the first one picked is still the first one stored.
    expect(onSave.mock.calls[0]![0].prefs.analytics_subjects)
      .toEqual(['maths', 'physics', 'chem', 'bio']);
  });

  it('does not offer a subject the account invented', async () => {
    // Both subject answers lead somewhere that needs a lattice behind the
    // subject: a page whose right-hand side is the skill tree, and a choice
    // between that tree's branches. There is no tree behind an invented name,
    // and `treeForSubject` would route it on group alone — confidently and
    // wrongly, which is how "Fantasy Football" filed under Business once
    // opened twenty nodes about unit economics.
    const user = userEvent.setup();
    render(
      <AnalyticsSetup
        subjects={[
          { id: 'maths', label: 'Mathematics' },
          { id: 'custom_fantasy_football', label: 'Fantasy Football', custom: true },
        ]}
        prefs={PREFS}
        onSave={saver()}
      />,
    );

    await toSubjects(user);
    expect(screen.getByRole('button', { name: /Mathematics/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fantasy Football/ })).not.toBeInTheDocument();
  });

  it('drops a custom subject already in the stored list', async () => {
    // Stored before the rule existed, or picked when it was still on offer.
    // Either way it must not survive a save that re-writes the list.
    const user = userEvent.setup();
    const onSave = saver();
    render(
      <AnalyticsSetup
        subjects={[
          { id: 'maths', label: 'Mathematics' },
          { id: 'custom_x', label: 'Something Invented', custom: true },
        ]}
        prefs={{ ...PREFS, analytics_subjects: ['maths', 'custom_x'] }}
        onSave={onSave}
      />,
    );

    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));
    expect(onSave.mock.calls[0]![0].prefs.analytics_subjects).toEqual(['maths']);
  });

  it('forgets the branch when its subject is un-picked', async () => {
    // A depth left behind for a subject no longer followed would be stored,
    // invisible, and would come back the day the subject was picked again — an
    // answer the reader gave once and has no way to see.
    const user = userEvent.setup();
    const onSave = saver();
    render(
      <AnalyticsSetup
        subjects={MANY}
        prefs={{
          ...PREFS,
          analytics_subjects: ['maths'],
          analytics_subject_depth: { maths: 'algorithms' },
        }}
        onSave={onSave}
      />,
    );

    await toSubjects(user);
    // Un-pick the only followed subject.
    await user.click(screen.getByRole('button', { name: /Mathematics/ }));

    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));

    expect(onSave.mock.calls[0]![0].prefs.analytics_subjects).toEqual([]);
    expect(onSave.mock.calls[0]![0].prefs.analytics_subject_depth).toEqual({});
  });

  it('drops a subject that has left the catalog since it was picked', async () => {
    const user = userEvent.setup();
    const onSave = saver();
    render(
      <AnalyticsSetup
        subjects={SUBJECTS}
        // 'physics' is not in SUBJECTS: nominated once, deleted since. It must
        // not come back on a save just because it is still in the stored list.
        prefs={{ ...PREFS, analytics_subjects: ['maths', 'physics'] }}
        onSave={onSave}
      />,
    );

    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));

    expect(onSave.mock.calls[0]![0].prefs.analytics_subjects).toEqual(['maths']);
  });
});

/**
 * The aims step, and the answers it refuses to carry forward.
 *
 * Its three fields are the only free text in this app that a model reads, and
 * two different things can go wrong with them: text that cannot be read as
 * language at all, which the write-up will reason from anyway, and readable
 * text that a bounded store will silently cut. The step tells them apart —
 * the first has no way past it, the second has an informed one — and that
 * distinction is the thing worth a test, because getting it backwards is
 * either a wizard that nags about nothing or one that saves a truncated list
 * and says nothing.
 *
 * ./ambitionCheck.test.ts covers which text falls into which. This covers what
 * the wizard does about it.
 */
describe('the aims step', () => {
  /** Walk to the aims step and follow one subject on the way. */
  async function toAims(user: ReturnType<typeof userEvent.setup>) {
    for (let step = 0; step < 3; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    await user.click(screen.getByRole('button', { name: /Mathematics/ }));
    // Past the subjects step and the branch step that following one adds.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    return screen.getByRole('textbox', { name: /what are you chasing/i });
  }

  it('carries an ordinary aim through without saying anything', async () => {
    const user = userEvent.setup();
    const onSave = saver();
    render(<AnalyticsSetup subjects={MANY} prefs={PREFS} onSave={onSave} />);

    const aim = await toAims(user);
    await user.type(aim, 'Qualify for Mathcounts Nationals');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));
    expect(onSave.mock.calls[0]![0].prefs.analytics_ambitions.maths?.aim)
      .toBe('Qualify for Mathcounts Nationals');
  });

  it('stops on an aim with no words in it, and does not move on', async () => {
    const user = userEvent.setup();
    render(<AnalyticsSetup subjects={MANY} prefs={PREFS} onSave={saver()} />);

    const aim = await toAims(user);
    await user.type(aim, '????');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/cannot be read as an answer/i)).toBeInTheDocument();
    // Still on the step, so the field is still there to be fixed.
    expect(screen.getByRole('textbox', { name: /what are you chasing/i })).toBeInTheDocument();
  });

  it('offers no way past a blocking problem', async () => {
    const user = userEvent.setup();
    render(<AnalyticsSetup subjects={MANY} prefs={PREFS} onSave={saver()} />);

    const aim = await toAims(user);
    await user.type(aim, 'asdfghjkl');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('button', { name: /let me fix that/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anyway/i })).not.toBeInTheDocument();
  });

  it('lets a truncation through, once it has been said out loud', async () => {
    const user = userEvent.setup();
    const onSave = saver();
    render(<AnalyticsSetup subjects={MANY} prefs={PREFS} onSave={onSave} />);

    await toAims(user);
    const lines = Array.from({ length: 14 }, (_, at) => `Stage ${at + 1}`).join('\n');
    await user.type(screen.getByRole('textbox', { name: /checkpoints/i }), lines);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // A warning, not a refusal: it names what would be lost and then lets go.
    expect(screen.getByText(/will be cut off/i)).toBeInTheDocument();
    expect(screen.getByText(/the last 2 will not be saved/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /carry on anyway/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // And it is not asked a second time at the save. The check runs again
    // there — see the test below — so without a remembered waiver this popup
    // would reappear over an answer the reader has already stood behind.
    await toTheEnd(user);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // Sent whole. The truncation is the server's to do, and the reader was
    // told it would happen rather than having it done to them quietly.
    expect(onSave.mock.calls[0]![0].milestones.maths).toHaveLength(14);
  });

  it('asks again when the answer changes after a waiver', async () => {
    const user = userEvent.setup();
    render(<AnalyticsSetup subjects={MANY} prefs={PREFS} onSave={saver()} />);

    await toAims(user);
    const field = screen.getByRole('textbox', { name: /checkpoints/i });
    await user.type(field, Array.from({ length: 14 }, (_, at) => `Stage ${at + 1}`).join('\n'));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: /carry on anyway/i }));

    // Back to the step, and two more stages on the end. The waiver was for the
    // fourteen; sixteen is a different answer and loses two more.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.type(screen.getByRole('textbox', { name: /checkpoints/i }), '\nStage 15\nStage 16');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/the last 4 will not be saved/i)).toBeInTheDocument();
  });

  /* The path the check exists for. The rail above the steps is clickable, so
     an unreadable aim can reach the save without the Next button ever being
     pressed — which is the ordinary path for somebody editing one answer. */
  it('checks again at the save, not only on the way past the step', async () => {
    const user = userEvent.setup();
    const onSave = saver();
    render(<AnalyticsSetup subjects={MANY} prefs={PREFS} onSave={onSave} />);

    const aim = await toAims(user);
    await user.type(aim, '????');

    // Jump to the last step by its pip rather than by pressing Next. Read out
    // of the rail rather than by title, so that reordering the steps moves
    // this with them instead of quietly landing it on the wrong screen.
    const rail = screen.getByRole('list', { name: /step \d+ of \d+/i });
    const pips = within(rail).getAllByRole('button');
    await user.click(pips[pips.length - 1]!);
    await user.click(screen.getByRole('button', { name: /open my analytics/i }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
