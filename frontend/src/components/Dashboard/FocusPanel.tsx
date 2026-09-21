/**
 * The dashboard's Focus panel — the pomodoro, in the space a goal dial had.
 *
 * ## What it was, and why it changed
 *
 * A stepper for the day's hour goal, a bar, and a Start Focus button that ran
 * an open-ended stopwatch. It asked "how much time do you want to focus today"
 * and then left you to it, which is a question about the day rather than an
 * instrument for working through one: nothing in the panel told you when to
 * stop, so the only structure on offer was the one you kept in your head.
 *
 * The app already had the instrument. hooks/usePomodoro has driven the Timer
 * page's cycle for as long as that page has existed, and it drives this now —
 * the same cycle, the same localStorage record, the same phases. Opening the
 * dashboard mid-pomodoro shows the pomodoro, because there is one of them and
 * not one per page.
 *
 * ## The hours goal did not go anywhere
 *
 * It moved off the panel, not out of the app. `usePomodoro` derives a goal from
 * the chosen level and style — six intervals of twenty-five minutes is two and
 * a half hours — and writes it through to the same `goalHours` the Focus card,
 * the calendar and the analytics pages read. The dial that used to set it by
 * hand is on the Timer page, in the setup that also picks the style, which is
 * where a decision about the shape of a day belongs. The footer line here still
 * states the day's standing against it.
 *
 * ## Both modes
 *
 * `html.focus-mode` folds the dashboard down to the work while a session runs,
 * and the panel is laid out twice for it — a column in the ordinary page, a row
 * across the short strip. The two layouts are the same markup and differ only
 * in styles/dashboard.css; nothing here is conditional on the mode, because a
 * panel that rendered differently in the two would be a second thing to keep
 * true rather than a second stylesheet.
 *
 * ## Why the session is passed in
 *
 * Unchanged, and now doubly true. The dashboard's Focus Time card reads the
 * same day, and two `useFocusSession` calls would each hold their own copy of
 * its localStorage record. The pomodoro is passed in for the same reason and
 * one more: it *drives* the session, so a second copy of the cycle would be a
 * second thing starting and stopping the account's focus clock.
 */
import '@/styles/focus-session.css';
import type { UseFocusSession } from '@/hooks/useFocusSession';
import type { UsePomodoro } from '@/hooks/usePomodoro';
import { PHASE_LABEL, clock, styleFor } from '@/components/Timer/pomodoro';
import { Card } from '@/components/ui';

export interface FocusPanelProps {
  session: UseFocusSession;
  pomodoro: UsePomodoro;
}

/**
 * The countdown ring.
 *
 * Its own copy rather than the Timer page's: that one is a 220px hero and this
 * is a 168px panel element, and the two differ in stroke, in radius and in
 * whether they carry a drop shadow. What they share is the phase gradient,
 * which is named the same in both stylesheets.
 *
 * `strokeDashoffset` is driven from `percent` so the arc is a reading of the
 * clock rather than an animation of its own — see the note in usePomodoro on
 * why nothing here counts ticks.
 */
function Dial({ percent, phase }: { percent: number; phase: string }) {
  const r = 74;
  const c = 2 * Math.PI * r;
  return (
    <svg className="fp-dial-svg" viewBox="0 0 168 168" aria-hidden="true">
      <defs>
        <linearGradient id={`fp-g-${phase}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={`var(--fp-${phase}-2)`} />
          <stop offset="100%" stopColor={`var(--fp-${phase})`} />
        </linearGradient>
      </defs>
      <circle className="fp-dial-track" cx="84" cy="84" r={r} />
      <circle
        className="fp-dial-run"
        cx="84"
        cy="84"
        r={r}
        stroke={`url(#fp-g-${phase})`}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
      />
    </svg>
  );
}

export function FocusPanel({ session, pomodoro }: FocusPanelProps) {
  const { phase, running, remaining, percent, done, level, doneToday } = pomodoro;
  const style = styleFor(pomodoro.style.id);
  const focusedHours = session.focused / 3600;

  return (
    <Card className={`focus-panel is-${phase}${running ? ' is-running' : ''}`} as="div">
      <h2>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.5" fill="currentColor" />
        </svg>
        Focus
      </h2>

      <div className="fp-dial">
        <Dial percent={percent} phase={phase} />
        {/* Polite rather than assertive: the time changes twice a second and a
            screen reader reading every one of them would be unusable. The
            phase and the remaining minutes are what a reader coming back to
            the tab wants, and politeness delivers them at a pause. */}
        <div className="fp-dial-text" aria-live="polite">
          <span className="fp-phase">{PHASE_LABEL[phase]}</span>
          <span className="fp-time">{clock(remaining)}</span>
          <span className="fp-sub">
            {phase === 'focus' ? `${style.focus} min interval` : 'Rest'}
          </span>
        </div>
      </div>

      {/* One interval per dot, filled as they are finished. The cycle's length
          is the style's, so a Gentle run shows four and a Deep one shows
          three — the row is the shape of this cycle rather than a fixed four. */}
      <ul className="fp-dots" aria-label={`${done} of ${style.rounds} intervals this cycle`}>
        {Array.from({ length: style.rounds }, (_, at) => (
          <li key={at} className={at < done ? 'is-done' : ''} aria-hidden="true" />
        ))}
      </ul>

      <div className="fp-controls">
        <button
          type="button"
          className="fp-btn fp-primary"
          onClick={running ? pomodoro.pause : pomodoro.start}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {running ? <path d="M8 5h3v14H8zm5 0h3v14h-3z" /> : <path d="M7 4.5v15l13-7.5z" />}
          </svg>
          {running ? 'Pause Focus' : 'Start Focus'}
        </button>

        {/* Skip is here and stop is not. A pomodoro is ended by finishing it or
            by leaving it paused; a third control meaning "stop" would be a
            fourth state the cycle does not have. */}
        <button type="button" className="fp-btn fp-round" onClick={pomodoro.skip} aria-label="Skip to the next interval">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 4.5v15l11-7.5z" /><path d="M19 5v14" />
          </svg>
        </button>
        <button type="button" className="fp-btn fp-round" onClick={pomodoro.reset} aria-label="Reset the cycle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v4h4" />
          </svg>
        </button>
      </div>

      {/* The day, which is what the hour dial used to be for. Both halves are
          stated because they answer different questions: the intervals say how
          the cycle is going, the hours say what the record will show. */}
      <p className="fp-today">
        <span>
          <strong>{doneToday}</strong> / {level.target} intervals today
        </span>
        <span className="fp-today-hrs">
          {focusedHours.toFixed(1)} / {pomodoro.goalHours.toFixed(1)} hrs
        </span>
      </p>
    </Card>
  );
}
