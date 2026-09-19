/**
 * The dashboard's Focus panel.
 *
 * The hour goal moves in half-hour steps; Start Focus begins a session that
 * keeps counting while the tab is away, and the button becomes Stop Focus.
 * All of that state is useFocusSession's — see the note there about why the
 * elapsed time is timestamp-based rather than ticked.
 *
 * Stopping asks first. An accidental click should not end a session, and the
 * original grew a confirmation for exactly that reason.
 *
 * The session is passed in rather than read here, because the dashboard's
 * Focus Time stat card shows the same day. Two `useFocusSession` calls would
 * each hold their own copy of the day's localStorage record, and pressing +
 * below would move this panel's goal while the card went on showing the old
 * one. The page owns it; both displays read the one object.
 */
import { useState } from 'react';
import '@/styles/focus-session.css';
import type { UseFocusSession } from '@/hooks/useFocusSession';
import { Button, Card } from '@/components/ui';

export interface FocusPanelProps {
  session: UseFocusSession;
}

export function FocusPanel({ session }: FocusPanelProps) {
  const focus = session;
  const [confirming, setConfirming] = useState(false);

  const focusedHours = focus.focused / 3600;

  return (
    <Card className="focus-panel" as="div">
      <h2>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.5" fill="currentColor" />
        </svg>
        Focus
      </h2>

      <div className="focus-goal">
        {/* The two lines of copy are one block, so the box can put them at its
            top and centre the control below them. Four loose children could
            only ever be evenly spaced or stacked; see the layout note on
            `.dash-main .focus-goal` in styles/dashboard-home.css. */}
        <div className="focus-goal-head">
          <h3 className="focus-goal-title">Focus Goal</h3>
          <p className="focus-goal-q">
            How much time do you want to focus today?
          </p>
        </div>

        <div className="focus-stepper">
          <button
            type="button"
            className="focus-step-btn"
            id="focusMinus"
            aria-label="Decrease focus goal"
            onClick={() => focus.setGoalHours(focus.goalHours - 0.5)}
          >
            −
          </button>
          <div className="focus-amount">
            <span id="focusHours">{focus.goalHours.toFixed(1)}</span>
            <span className="focus-unit">hrs</span>
          </div>
          <button
            type="button"
            className="focus-step-btn"
            id="focusPlus"
            aria-label="Increase focus goal"
            onClick={() => focus.setGoalHours(focus.goalHours + 0.5)}
          >
            +
          </button>
        </div>
        <div className="focus-progress-wrap">
          <div className="focus-progress">
            <div
              className="focus-progress-fill"
              id="focusProgressFill"
              style={{ width: `${focus.percent}%` }}
            />
          </div>
          <div className="focus-progress-row">
            <span id="focusProgressLabel">
              {focusedHours.toFixed(1)} / {focus.goalHours.toFixed(1)} hrs
              focused
            </span>
            <span id="focusProgressPct">{focus.percent}%</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`focus-start-btn${focus.running ? ' is-running' : ''}`}
        id="focusStartBtn"
        onClick={() => (focus.running ? setConfirming(true) : focus.start())}
      >
        <svg
          className="focus-ico-play"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        <svg
          className="focus-ico-stop"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
        <span className="focus-start-label">
          {focus.running ? 'Stop Focus' : 'Start Focus'}
        </span>
      </button>

      <p className="focus-hint">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
        </svg>
        Eliminate distractions and get in the zone.
      </p>

      {/* The same words and the same classes focus.js injected a stylesheet
          for; the styles are in styles/focus-session.css. */}
      {confirming && (
        <div
          className="focus-confirm-overlay show"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirming(false);
          }}
        >
          <div
            className="focus-confirm-box"
            role="dialog"
            aria-modal="true"
            aria-label="Stop focus session"
          >
            <p className="focus-confirm-title">Stop focusing?</p>
            <p className="focus-confirm-msg">
              Your time so far is saved — but are you sure you want to quit this
              session?
            </p>
            <div className="focus-confirm-actions">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Keep Going
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  focus.stop();
                  setConfirming(false);
                }}
              >
                Stop Focus
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
