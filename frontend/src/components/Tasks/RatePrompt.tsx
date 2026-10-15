/**
 * "Rate your performance on this task" — the one question the app asks back.
 *
 * Everything else on a task is measured: what it was worth, how long it took,
 * whether it beat its deadline. None of that knows whether the work was hard or
 * whether it went well, and those are the two things the person who did it
 * knows and the database never will.
 *
 * ## Two rows, not one
 *
 * Difficulty and execution are independent, and collapsing them into a single
 * "how did that go" loses the distinction that makes either worth having: an
 * easy task done badly and a brutal one done well both land on three stars, and
 * they are not the same week. Asked apart, they stay apart in the record.
 *
 * ## How much is asked is the account's to choose
 *
 * Three depths, set in Settings (or on Analytics, beside the panels that read
 * them). At `none` this dialog never opens at all — the caller does not raise
 * it. At `ratings` it is the two rows above. At `reasons` a third question
 * follows them: the one thing that made the difference, from a closed list of
 * six.
 *
 * ## The two answers the plan can act on
 *
 * Stars are the reader grading themselves. Two things here are not, and they
 * are what lets the plan say *what* went wrong instead of how much happened
 * (backend/tracking/record.py):
 *
 *   - **How many did you get right?** Asked when the title names a count of
 *     problems ("#1-10", "12 problems"), with that count filled in as the
 *     total; any other task can add a score with one click.
 *   - **What made it hard?** Asked whenever execution is rated 1 or 2, at
 *     every depth but `none`. A rough session is the one moment the reason is
 *     worth a tap, and it is the answer the plan turns into a fix.
 *
 * **The third question depends on the second.** It cannot be asked until the
 * execution star is answered, because which six words are offered follows from
 * it — a task rated 1 is asked what made it hard, a task rated 4 what made it
 * go well. So the row appears when execution is answered and changes sides if
 * that answer changes, which also clears an answer that no longer belongs to
 * the list it came from.
 *
 * ## Nothing here is required
 *
 * The task is already done and its XP is already banked before this appears —
 * see `rateTask` in services/tasks for why the two are separate calls. So this
 * dialog can be dismissed, ignored, or half-answered, and all three are fine.
 * Escape closes it, the backdrop closes it, and Skip closes it; only the stars
 * that were actually clicked are sent. A prompt that blocked the reward it
 * follows would be a toll booth, and people learn to click through those
 * without reading, which would poison the very data it exists to collect.
 */
import { useCallback, useEffect, useState } from 'react';
import { reasonOf, reasonsFor } from '@/utils/ratings';
import { problemCount } from '@/utils/problemCount';
import type { RatingDepth } from '@/services/settings';
import type { RatingAnswers } from '@/services/tasks';
import '@/styles/rate-prompt.css';

/** The five stars, and what each one means. Hover and focus print the word. */
const SCALE = 5;

const DIFFICULTY_WORDS = ['Trivial', 'Easy', 'Fair', 'Hard', 'Brutal'];
const EXECUTION_WORDS = ['Poor', 'Patchy', 'Solid', 'Strong', 'Excellent'];

export interface RatePromptProps {
  /** What was finished, so the dialog names the thing it is asking about. */
  taskName: string;
  /**
   * How much to ask. 'reasons' adds the third row; anything else is the two
   * star rows. 'none' never reaches here — the caller does not open the
   * dialog at all — so it is accepted only so the account's preference can be
   * passed straight through without a translation at every call site.
   */
  depth?: RatingDepth;
  /** Sends whatever was answered. Only the answered parts are passed. */
  onSubmit: (ratings: RatingAnswers) => void;
  /** Dismissal, by any of its three routes. */
  onClose: () => void;
}

interface StarsProps {
  label: string;
  hint: string;
  words: string[];
  value: number;
  onChange: (value: number) => void;
}

/**
 * One row of five stars.
 *
 * Radios under the hood rather than buttons, because that is what this is: five
 * options, one choice, and a keyboard user gets arrow keys and a group label
 * for free. The visible stars are the labels; the inputs themselves are hidden
 * without being removed from the tree.
 *
 * Clicking the star already chosen clears the row. That is the only way back to
 * "I would rather not say" once something has been clicked, and without it a
 * misclick becomes a permanent answer.
 */
function Stars({ label, hint, words, value, onChange }: StarsProps) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <fieldset className="tk-rate-row">
      <legend className="tk-rate-label">
        {label}
        <span>{hint}</span>
      </legend>

      <div className="tk-rate-stars" onMouseLeave={() => setHovered(0)}>
        {Array.from({ length: SCALE }, (_, index) => {
          const star = index + 1;
          const on = star <= shown;
          return (
            <label
              key={star}
              className={`tk-rate-star${on ? ' is-on' : ''}`}
              onMouseEnter={() => setHovered(star)}
            >
              <input
                type="radio"
                name={label}
                checked={value === star}
                onChange={() => onChange(star)}
                onClick={() => {
                  if (value === star) onChange(0);
                }}
              />
              <span aria-hidden="true">★</span>
              <span className="tk-rate-sr">
                {star} of {SCALE} — {words[index]}
              </span>
            </label>
          );
        })}
        {/* The word for whatever is under the cursor, or whatever was chosen.
            A row of five identical stars says nothing about what three means;
            this is where that lives, and it holds the row's height whether or
            not anything is chosen so the dialog does not jump. */}
        <span className="tk-rate-word">{shown ? words[shown - 1] : ''}</span>
      </div>
    </fieldset>
  );
}

/**
 * The third row: six words, one choice, and clicking the chosen one clears it.
 *
 * Chips rather than a select, for the same reason the stars are stars: this is
 * asked at the moment somebody has just finished something and wants to move
 * on, and a dropdown is two clicks and a scan of a list that is not on screen
 * until you open it.
 */
function Reasons({
  side,
  value,
  onChange,
}: {
  side: 'struggle' | 'went-well';
  value: string;
  onChange: (value: string) => void;
}) {
  const options = reasonsFor(side === 'went-well' ? 5 : 1);

  return (
    <fieldset className="tk-rate-row">
      <legend className="tk-rate-label">
        {side === 'went-well' ? 'What made it go well?' : 'What made it hard?'}
        <span>The main one. Optional, like the stars.</span>
      </legend>

      <div className="tk-rate-reasons">
        {options.map((option) => {
          const on = value === option.key;
          return (
            <label key={option.key} className={`tk-rate-reason${on ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="reason"
                checked={on}
                onChange={() => onChange(option.key)}
                onClick={() => {
                  if (on) onChange('');
                }}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A whole number from a field, or null when it is empty or not one. */
function whole(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  return Number(text.trim());
}

/**
 * "How many did you get right?" Two small number fields, `got` of `of`. Shown
 * open when the title names a count, behind "Add a score" otherwise.
 */
function Score({
  got,
  of,
  onGot,
  onOf,
}: {
  got: string;
  of: string;
  onGot: (value: string) => void;
  onOf: (value: string) => void;
}) {
  const total = whole(of);
  const right = whole(got);
  const wrong = right !== null && total !== null && right > total;
  return (
    <fieldset className="tk-rate-row">
      <legend className="tk-rate-label">
        How many did you get right?
        <span>This is what tells the plan what to go back over.</span>
      </legend>
      <div className="tk-rate-score">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={total ?? 500}
          aria-label="Number right"
          value={got}
          onChange={(event) => onGot(event.target.value)}
        />
        <span>of</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          aria-label="Number of problems"
          value={of}
          onChange={(event) => onOf(event.target.value)}
        />
        {wrong && <span className="tk-rate-score-warn">That's more than there were.</span>}
      </div>
    </fieldset>
  );
}

export function RatePrompt({ taskName, depth = 'ratings', onSubmit, onClose }: RatePromptProps) {
  const [difficulty, setDifficulty] = useState(0);
  const [execution, setExecution] = useState(0);
  const [reason, setReason] = useState('');
  const counted = problemCount(taskName);
  const [scoring, setScoring] = useState(counted !== null);
  const [got, setGot] = useState('');
  const [of, setOf] = useState(counted !== null ? String(counted) : '');
  const right = whole(got);
  const total = whole(of);
  const score = scoring && right !== null && total !== null && total >= 1 && right <= total
    ? { score_got: right, score_of: total }
    : null;

  /* Which six are on offer, or null while there is nothing to ask them about.
     The word already chosen has to belong to the list showing: rating a task 2
     and picking "ran out of time", then changing the star to 4, would otherwise
     save a struggle reason against work the reader has just called strong. */
  const side = execution === 0 ? null : execution >= 3 ? 'went-well' : 'struggle';
  // Every depth asks why a task went badly; only 'reasons' asks why one went well.
  const asking = depth === 'reasons' ? side : side === 'struggle' ? side : null;
  const chosen = asking && reasonOf(reason);
  const keeps = chosen && (asking === 'went-well') === (chosen.side === 'went-well');

  // Escape closes, like every other dialog in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = useCallback(() => {
    // Only what was answered. A zero here means "not answered" and must not
    // reach the server, which would reject it anyway — see `RATING_RANGE`. The
    // reason goes only when it still belongs to the side being asked.
    onSubmit({
      ...(difficulty > 0 ? { difficulty } : {}),
      ...(execution > 0 ? { execution } : {}),
      ...(keeps ? { reason } : {}),
      ...(score ?? {}),
    });
  }, [difficulty, execution, keeps, onSubmit, reason, score]);

  const answered = difficulty > 0 || execution > 0 || score !== null;

  return (
    <div
      className="tk-rate-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="tk-rate-popup" role="dialog" aria-modal="true" aria-labelledby="tk-rate-title">
        <h3 className="tk-rate-title" id="tk-rate-title">
          Rate your performance on this task
        </h3>
        <p className="tk-rate-task" title={taskName}>
          {taskName}
        </p>

        <Stars
          label="Difficulty"
          hint="How hard was it?"
          words={DIFFICULTY_WORDS}
          value={difficulty}
          onChange={setDifficulty}
        />
        <Stars
          label="Execution"
          hint="How well did it go?"
          words={EXECUTION_WORDS}
          value={execution}
          onChange={setExecution}
        />

        {scoring ? (
          <Score got={got} of={of} onGot={setGot} onOf={setOf} />
        ) : (
          <button type="button" className="tk-rate-add-score" onClick={() => setScoring(true)}>
            Add a score
          </button>
        )}

        {asking && (
          <Reasons
            side={asking}
            value={keeps ? reason : ''}
            onChange={setReason}
          />
        )}

        <div className="tk-rate-actions">
          <button type="button" className="tk-rate-skip" onClick={onClose}>
            Skip
          </button>
          <button type="button" className="tk-rate-save" onClick={save} disabled={!answered}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
