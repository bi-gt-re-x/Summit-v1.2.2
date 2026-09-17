/**
 * The moment a new stage opens, said out loud.
 *
 * ## Why this is an interruption and the rest of the page is not
 *
 * Everything else about the ladder is passive: a meter fills, a hairline grows
 * under a tab, a countdown ticks down. All of it is on a page the reader has to
 * already be looking at — and the one moment that actually matters is the one
 * they are least likely to be watching for, because the threshold is crossed by
 * *working*, somewhere else in the app, days after they last read a countdown.
 *
 * So arriving is the single thing here allowed to take the screen. It is the
 * payoff for every countdown the page has shown them, and a payoff nobody sees
 * is not a payoff.
 *
 * ## It says what opened, not that something opened
 *
 * "Weekly trends are now available" is a notification about the software.
 * `MILESTONES` already holds what each threshold gives a reader in their own
 * terms, and that is what this prints — the same sentence the countdown has
 * been promising, so arriving reads as the promise being kept rather than as a
 * new announcement.
 *
 * ## Dismissed, not timed out
 *
 * `LevelUp` clears itself after a couple of seconds, which is right for a
 * flourish that says well done and nothing else. This one carries a sentence
 * worth reading and a link worth following, so it waits. It is a dialog, it
 * traps nothing, and Escape closes it like the close button does.
 */
import { useCallback, useEffect } from 'react';
import { MILESTONES } from './milestones';
import { STAGE_BRINGS, STAGE_LABEL, type Stage } from '@/utils/dataMaturity';

export interface StageReachedProps {
  stage: Stage;
  /** Active days behind it, for the line under the heading. */
  activeDays: number;
  /** Records that this one has been announced, and closes. */
  onDone: () => void;
}

export function StageReached({ stage, activeDays, onDone }: StageReachedProps) {
  const close = useCallback(() => onDone(), [onDone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  /* The highest threshold now behind them, for what it gives — see
     ./milestones, which is the same table the countdown has been reading. A
     stage with no matching row still gets the overlay: the arrival is the
     news, and `STAGE_BRINGS` names it either way. */
  const milestone = [...MILESTONES].reverse().find((step) => activeDays >= step.need);

  return (
    <div className="ax-reached" role="dialog" aria-modal="true" aria-labelledby="ax-reached-title">
      <div className="ax-reached-card">
        <p className="ax-reached-eyebrow">A new stage of your analytics</p>
        <h2 id="ax-reached-title">{STAGE_LABEL[stage]}</h2>
        <p className="ax-reached-lead">
          {activeDays} days of your work are on record, and that is enough for{' '}
          <strong>{STAGE_BRINGS[stage].toLowerCase()}</strong>.
        </p>

        {milestone && <p className="ax-reached-reward">{milestone.reward}</p>}

        {/* One button. This only ever mounts on the analytics page, so an
            "Open analytics" beside it was a link to where the reader already
            was — two controls for one action, one of which does nothing. */}
        <div className="ax-reached-actions">
          <button type="button" className="ax-btn" onClick={close}>
            Have a look
          </button>
        </div>

        <button
          type="button"
          className="ax-reached-close"
          onClick={close}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
