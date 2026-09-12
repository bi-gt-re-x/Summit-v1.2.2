/**
 * Creating a goal, one question at a time.
 *
 * The old modal was a form: title, type, target, deadline, priority, all at
 * once. That is the right shape for a counter and the wrong one for an
 * outcome, because the hard part of setting a real goal is not filling in
 * fields — it is answering, in order, what you are trying to do, why it
 * matters, when you want it, and how you will know. A form asks all four at
 * once and gets a title and three defaults.
 *
 * So it is five steps, and only the first is required. Every later one can be
 * skipped and added from the goal's own view afterwards, which is the honest
 * bargain: a goal you were made to fully specify before you could write it
 * down is a goal you did not write down.
 *
 * The old modal is still here and still works — see GoalModal. It is what
 * edits an existing goal, and what a reader who wants a plain XP counter gets.
 *
 * ## The one thing besides a title that is not optional
 *
 * The subject. Everything else here can be filled in later from the goal's own
 * view, and saying so is what makes the wizard finishable — but a goal with no
 * subject is not an under-specified goal, it is a goal that half the app
 * cannot see. `subject_ids` is the only link between a goal and the record of
 * the work being done toward it: the subject page reads it to find the goals
 * it is for (components/Subject/model), the analytics Goals tab reads it to
 * split goals by subject (components/Analytics/useAnalyticsModel), and
 * utils/goalSuggest reads it to know which goal a new task belongs to. Without
 * it the goal is a bar on this page and nothing anywhere else.
 *
 * It was optional, and it was not asked for at all, so every goal in the
 * account had an empty one and every one of those readings came back empty.
 * That is the failure this step exists to prevent — a feature that silently
 * has no input is worse than one that is missing, because nothing on screen
 * says why it is blank.
 *
 * ## The model, on the last step
 *
 * `suggestMilestones` has always taken a title for a goal that does not exist
 * yet — "which is what the creation wizard has", its note says — and the
 * wizard never called it. The checkpoints step now can: one button drafts five
 * from what the first three steps collected, into the same editable list a
 * typed checkpoint goes into. What is in that list when the goal is made is
 * what the goal gets; the page drafts checkpoints only for a goal that arrives
 * with none, and drafts steps under every checkpoint either way (see
 * components/Goals/plan).
 *
 * A counter — XP, streak, tasks, focus — is not made here at all. It has no
 * outcome, no subject and no checkpoints; see SystemGoalWizard.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { CATEGORIES } from './Outcome';
import { AskModel } from './AskModel';
import { SubjectPicker } from '@/components/SubjectPicker';
import type { Subject } from '@/services/subjects';
import type { DraftedGoal, NewGoal } from '@/services/goals';
import type { GoalCategory, GoalMeasure } from '@/types';

const STEPS = [
  'What do you want to accomplish?',
  'Why does it matter?',
  'When do you want it?',
  'How will you know?',
  'Break it into checkpoints',
] as const;

/**
 * One line of advice per step, at the top of the panel.
 *
 * The wizard asks good questions and then leaves the reader to answer them
 * cold — and the hard part of setting a goal is not the typing, it is knowing
 * what a good answer looks like. Each of these is the thing someone who had
 * written a lot of goals would say before you started that step, and they are
 * one sentence because a paragraph of coaching above a text box is something
 * to scroll past.
 */
const TIPS: Record<number, string> = {
  0: 'Name the finish line, not the effort — "Reach USACO Gold", not "practise more".',
  // Not a tip so much as the reason the field is not optional. Somebody who
  // knows what the subject buys them picks the right one rather than the
  // nearest one.
  1: 'The reason you would still want this in three months. You will read it back on a bad week.',
  2: 'A date you half-believe beats no date. With one, the app can say whether you are on pace.',
  3: 'Milestones when finishing is a state you arrive at, a number when it accumulates.',
  4: 'Three to six works. Each should be a state the goal reaches, not a task you do.',
};

/** How far out a goal's date starts, when the reader has not moved it. */
const DEFAULT_HORIZON_DAYS = 90;

/**
 * A first target date, `DEFAULT_HORIZON_DAYS` from today.
 *
 * The field opened empty, and an empty date field is almost always left empty
 * — so goals arrived with no deadline, which is the one answer that costs the
 * app the ability to say anything about pace, and which then leaves every
 * checkpoint under the goal undated too (see `_spread_dates` in
 * backend/api/goals.py, which lays the checkpoints out across whatever this
 * ends up being). A quarter is a real horizon rather than a placeholder: long
 * enough for something worth calling a goal, near enough to argue with. The
 * reader changes it on the step it is asked on.
 */
function defaultDeadline(today = new Date()): string {
  const at = new Date(today);
  at.setDate(at.getDate() + DEFAULT_HORIZON_DAYS);
  return at.toISOString().slice(0, 10);
}

/** What the wizard knows about the goal by its last step, for the model. */
export interface MilestoneDraftRequest {
  title: string;
  why: string;
  description: string;
  category: GoalCategory;
  deadline: string;
}

/** The model's checkpoints, or the reason there are none — worded to show. */
export interface MilestoneDraft {
  milestones?: string[];
  problem?: string;
}

/** A whole goal from a sentence, or the reason there is not one. */
export interface WholeGoalDraft {
  goal?: DraftedGoal;
  problem?: string;
}

export interface NewGoalWizardProps {
  open: boolean;
  busy: boolean;
  /** The account's catalogue, for the subject this goal is filed under. */
  subjects: Subject[];
  onClose: () => void;
  onSave: (goal: NewGoal) => void;
  /** Draft the checkpoints. Absent, and the last step offers no button. */
  onSuggest?: (goal: MilestoneDraftRequest) => Promise<MilestoneDraft>;
  /**
   * Draft the whole goal from one sentence. Absent, and the first step offers
   * no box — the wizard is then exactly the form it has always been.
   */
  onDraft?: (idea: string) => Promise<WholeGoalDraft>;
  /**
   * The subject to start on, for a wizard opened from a subject's own page.
   * Still changeable — it is where the picker starts, not a lock.
   */
  subjectId?: string;
}

export function NewGoalWizard({
  open,
  busy,
  subjects,
  onClose,
  onSave,
  onSuggest,
  onDraft,
  subjectId: startSubject,
}: NewGoalWizardProps) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GoalCategory>('other');
  const [subjectId, setSubjectId] = useState<string | null>(startSubject ?? null);
  const [why, setWhy] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [priority, setPriority] = useState(5);
  const [measure, setMeasure] = useState<GoalMeasure>('milestones');
  const [unit, setUnit] = useState('');
  const [current, setCurrent] = useState('');
  const [target, setTarget] = useState('');
  const [milestones, setMilestones] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestProblem, setSuggestProblem] = useState<string | null>(null);
  /** The sentence the whole-goal draft is written from. Never saved. */
  const [idea, setIdea] = useState('');
  const [drafting, setDrafting] = useState(false);
  /* Which request is current. A model call takes seconds, and closing the
     wizard in the middle of one must not let its answer land in the next
     goal's list — the component stays mounted while closed. */
  const asking = useRef(0);

  const reset = useCallback(() => {
    asking.current += 1;
    setSuggesting(false);
    setSuggestProblem(null);
    setStep(0);
    setTitle('');
    setDescription('');
    setCategory('other');
    setSubjectId(null);
    setWhy('');
    setDeadline(defaultDeadline());
    setPriority(5);
    setMeasure('milestones');
    setUnit('');
    setCurrent('');
    setTarget('');
    setMilestones([]);
    setDraft('');
    setIdea('');
    setDrafting(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  /** What each step needs before it will let you past it. */
  const blocked = useMemo(() => {
    /* The subject is a gate rather than a nudge. See the note at the top:
       it is the only field that decides whether the goal is visible to the
       rest of the app at all, and an optional field asked once is a field
       most goals arrive without. */
    if (step === 0) return !title.trim() || !subjectId;
    // A number goal is the one place a later step can be wrong rather than
    // merely empty: measuring by a figure and not saying what the figure is
    // makes a goal that can never move.
    if (step === 3 && measure === 'number') return !Number(target);
    return false;
  }, [measure, step, subjectId, target, title]);

  /**
   * One sentence in, most of the wizard out.
   *
   * The checkpoint drafting below starts from a goal the reader has already
   * shaped. This starts before that: they type roughly what they want, and
   * the title, the reason, the field, the target date and the five
   * checkpoints all arrive filled in, on the step they are already looking
   * at, with four more steps still ahead of them to change any of it.
   *
   * **The subject is deliberately not written.** It is the one field the
   * wizard refuses to proceed without (see the note at the top of this file),
   * it is chosen from the account's own followed subjects, and a model
   * guessing which of *your* subjects a goal belongs to is a guess that would
   * be silently wrong. So the draft fills everything else and the step stays
   * blocked until the reader answers the one question that is theirs.
   *
   * `asking` guards this the same way it guards the checkpoints: the wizard
   * stays mounted when closed, and an answer landing in the next goal's form
   * is the bug that ref exists for.
   */
  const draftWhole = useCallback(async () => {
    if (!onDraft || !idea.trim()) return;
    const mine = ++asking.current;
    setDrafting(true);
    setSuggestProblem(null);
    try {
      const result = await onDraft(idea.trim());
      if (mine !== asking.current) return;
      if (!result.goal) {
        setSuggestProblem(result.problem ?? 'That could not be drafted. Try again.');
        return;
      }
      const goal = result.goal;
      setTitle(goal.title);
      if (goal.why) setWhy(goal.why);
      if (goal.category) setCategory(goal.category);
      if (goal.deadline) setDeadline(goal.deadline);
      if (goal.milestones.length) setMilestones(goal.milestones);
      // Checkpoints mean this is an outcome goal, whatever the measure was
      // sitting at — and it is the wizard's own default anyway.
      setMeasure('milestones');
    } finally {
      if (mine === asking.current) setDrafting(false);
    }
  }, [idea, onDraft]);

  /** Five checkpoints from the model, into the editable list. Replaces it. */
  const suggest = useCallback(async () => {
    if (!onSuggest || !title.trim()) return;
    const mine = ++asking.current;
    setSuggesting(true);
    setSuggestProblem(null);
    try {
      const result = await onSuggest({
        title: title.trim(),
        why: why.trim(),
        description: description.trim(),
        category,
        deadline,
      });
      if (mine !== asking.current) return;
      if (result.milestones?.length) setMilestones(result.milestones);
      else setSuggestProblem(result.problem ?? 'No checkpoints came back. Try again.');
    } finally {
      if (mine === asking.current) setSuggesting(false);
    }
  }, [category, deadline, description, onSuggest, title, why]);

  const save = useCallback(() => {
    onSave({
      title: title.trim(),
      description: description.trim(),
      // The column keeps its four values whatever the measure is; the backend
      // reads `measure`. See backend/api/goals.py.
      goal_type: 'xp',
      measure,
      category,
      // One id today. The column is a comma-separated list because a note or
      // a goal can legitimately name several — see the field's note in
      // types/models — and writing one into it keeps that door open.
      subject_ids: subjectId ?? '',
      why: why.trim(),
      deadline,
      priority,
      unit: unit.trim(),
      current_value: Number(current) || 0,
      target_number: Number(target) || 0,
      milestones,
    });
    reset();
  }, [
    category, current, deadline, description, measure, milestones, onSave,
    priority, reset, subjectId, target, title, unit, why,
  ]);

  if (!open) return null;

  return (
    <div className="gx-drawer-backdrop" onClick={close} role="presentation">
      <div
        className="gx-wizard"
        role="dialog"
        aria-label="New goal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gx-wizard-head">
          <span className="gx-wizard-step">
            Step {step + 1} of {STEPS.length}
          </span>
          <h2>{STEPS[step]}</h2>
          <button type="button" className="gx-close" onClick={close} aria-label="Close">
            ×
          </button>
        </header>

        <span className="gx-wizard-rail" aria-hidden="true">
          {STEPS.map((label, index) => (
            <i key={label} className={index <= step ? 'is-on' : ''} />
          ))}
        </span>

        <div className="gx-wizard-body">
          {TIPS[step] && (
            <p className="gx-wizard-tip">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6M10 21h4" />
                  <path d="M12 3a6 6 0 0 0-3.5 10.9c.3.3.5.7.5 1.1h6c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3z" />
                </svg>
              </span>
              {TIPS[step]}
            </p>
          )}
          {step === 0 && (
            <>
              {/* The shortcut past the whole form, offered before the form.
 
                  Above the title field rather than beside it, because it is
                  the thing to try *first* — a reader who knows exactly what
                  their goal is called scrolls past it in a second, and a
                  reader who does not is looking at the one box they can
                  actually answer. What comes back fills four of the five
                  steps; the subject is still theirs to pick, and the step
                  stays blocked until they do. */}
              {onDraft && (
                <div className="gx-idea">
                  <label htmlFor="gx-idea">Not sure how to phrase it?</label>
                  <div className="gx-idea-row">
                    <input
                      id="gx-idea"
                      value={idea}
                      maxLength={200}
                      placeholder="get good at competition maths this year"
                      disabled={drafting}
                      onChange={(event) => setIdea(event.target.value)}
                      onKeyDown={(event) => {
                        // The wizard's footer has its own submit, and Enter in
                        // a bare input inside a dialog would reach it.
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        void draftWhole();
                      }}
                    />
                    <AskModel
                      label="Draft it all"
                      busy={drafting}
                      disabled={!idea.trim()}
                      onAsk={() => void draftWhole()}
                      primary
                      title="Fills in the title, the reason, the field, a target date and five checkpoints — all of it editable"
                    />
                  </div>
                  {/* The two model calls share `suggestProblem`, and only
                      one of them can be in flight, so the message is printed
                      at whichever step raised it. */}
                  {suggestProblem && (
                    <p className="gx-ms-problem" role="alert">
                      {suggestProblem}
                    </p>
                  )}
                  <p className="gx-hint">
                    Say roughly what you want and the rest of this wizard fills
                    itself in. You still pick the subject, and you can change
                    every word of it.
                  </p>
                </div>
              )}

              <label htmlFor="gx-title">The outcome, not the activity</label>
              <input
                id="gx-title"
                value={title}
                autoFocus
                placeholder="Reach USACO Gold"
                onChange={(event) => setTitle(event.target.value)}
              />
              <p className="gx-hint">
                Something you either reached or did not.
              </p>

              <label htmlFor="gx-desc">Anything worth remembering about it</label>
              <textarea
                id="gx-desc"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />

              <label>What is it about?</label>
              <div className="gx-chips">
                {CATEGORIES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`gx-chip tone-${entry.tone}${entry.id === category ? ' is-on' : ''}`}
                    onClick={() => setCategory(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {/* The category above is a colour and an icon. This is the link
                  to the record — see the note at the top of this file — and
                  the two sit together because to a reader they are the same
                  question asked twice, and separating them across steps would
                  make the second one look like a duplicate to skip. */}
              <label>Which subject is the work for?</label>
              <div className="gx-subject">
                <SubjectPicker
                  id="gx-subject"
                  label="Subject:"
                  optional={false}
                  subjects={subjects}
                  value={subjectId}
                  onChange={setSubjectId}
                />
              </div>
              <p className="gx-hint">
                Required. It is what lets that subject's page read your record against this
                goal — without it the goal is a bar on this page and nothing anywhere else.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <label htmlFor="gx-why">Why this one</label>
              <textarea
                id="gx-why"
                rows={4}
                autoFocus
                value={why}
                placeholder="What changes for you if this happens?"
                onChange={(event) => setWhy(event.target.value)}
              />
              <p className="gx-hint">
                For you, not the app. Nothing is computed from it.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <label htmlFor="gx-deadline">Target date</label>
              <input
                id="gx-deadline"
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
              <p className="gx-hint">
                Optional. With a date, the app can tell you whether you are on pace.
              </p>

              <label htmlFor="gx-priority">How much does it matter? ({priority} / 10)</label>
              <input
                id="gx-priority"
                type="range"
                min={1}
                max={10}
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
              />
              <p className="gx-hint">
                Weights it in the overall figure at the top of the page.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <label>How will you know you got there?</label>
              <div className="gx-choices">
                <button
                  type="button"
                  className={`gx-choice${measure === 'milestones' ? ' is-on' : ''}`}
                  onClick={() => setMeasure('milestones')}
                >
                  <strong>By checkpoints</strong>
                  <span>
                    There is no number. You get there by passing a handful of states — the next
                    step is where you list them.
                  </span>
                </button>
                <button
                  type="button"
                  className={`gx-choice${measure === 'number' ? ' is-on' : ''}`}
                  onClick={() => setMeasure('number')}
                >
                  <strong>By a number</strong>
                  <span>
                    A rating, a score, a count — something you will read off somewhere else and
                    type in here.
                  </span>
                </button>
              </div>

              {measure === 'number' && (
                <div className="gx-number-row">
                  <span>
                    <label htmlFor="gx-cur">Where you are now</label>
                    <input
                      id="gx-cur"
                      type="number"
                      value={current}
                      onChange={(event) => setCurrent(event.target.value)}
                    />
                  </span>
                  <span>
                    <label htmlFor="gx-tgt">Target</label>
                    <input
                      id="gx-tgt"
                      type="number"
                      value={target}
                      onChange={(event) => setTarget(event.target.value)}
                    />
                  </span>
                  <span>
                    <label htmlFor="gx-unit">What it counts</label>
                    <input
                      id="gx-unit"
                      value={unit}
                      placeholder="rating"
                      onChange={(event) => setUnit(event.target.value)}
                    />
                  </span>
                </div>
              )}
              <p className="gx-hint">
                You update the figure; the app does the pace arithmetic.
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <label>The checkpoints, in the order you will hit them</label>
              {onSuggest && (
                <div className="gx-ms-suggest">
                  <button
                    type="button"
                    className="gx-btn"
                    disabled={suggesting || !title.trim()}
                    onClick={() => void suggest()}
                  >
                    {suggesting
                      ? 'Drafting…'
                      : milestones.length
                        ? 'Redraft with AI'
                        : 'Suggest with AI'}
                  </button>
                  <span className="gx-quiet">
                    {milestones.length
                      ? 'Replaces the list below.'
                      : 'Five, from your title, your reason and your date.'}{' '}
                    Edit or remove any of them after.
                  </span>
                </div>
              )}
              {suggestProblem && (
                <p className="gx-ms-problem" role="alert">
                  {suggestProblem}
                </p>
              )}
              {milestones.length > 0 && (
                <p className="gx-hint">
                  {deadline
                    ? `Spread evenly between today and ${deadline}. Move any from the goal's timeline.`
                    : 'A fortnight apart from today. Move any from the goal\u2019s timeline.'}
                </p>
              )}
              <ol className="gx-draft-list">
                {milestones.map((entry, index) => (
                  <li key={`${entry}-${index}`}>
                    <span>{entry}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${entry}`}
                      onClick={() => setMilestones(milestones.filter((_, at) => at !== index))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
              <form
                className="gx-ms-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = draft.trim();
                  if (!next) return;
                  setMilestones([...milestones, next]);
                  setDraft('');
                }}
              >
                <input
                  value={draft}
                  autoFocus
                  placeholder="Finish the Bronze curriculum"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit" className="gx-btn" disabled={!draft.trim()}>
                  Add
                </button>
              </form>
              <p className="gx-hint">
                A state the goal reaches, not a thing you do on a Tuesday. Leave it empty and the
                model drafts them once the goal is made. Either way, each checkpoint then gets its
                steps drafted.
              </p>
            </>
          )}
        </div>

        <footer className="gx-wizard-foot">
          <button
            type="button"
            className="gx-btn is-quiet"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="gx-btn is-primary"
              disabled={blocked}
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="gx-btn is-primary"
              disabled={busy || !title.trim()}
              onClick={save}
            >
              Create goal
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
