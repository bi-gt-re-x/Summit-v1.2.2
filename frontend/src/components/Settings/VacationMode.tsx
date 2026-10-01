/**
 * Vacation mode: the control on the Settings page that pauses the streak.
 *
 * Two ways to say how long — a number of days, or the last day away — because
 * people think about a trip both ways ("a week", "until the 12th") and making
 * one of them do arithmetic is how a vacation ends a day early. Either way it
 * starts today: a vacation planned for next month is a calendar entry, and the
 * streak has nothing to do with it until the day comes.
 *
 * While one is running the control turns into what it is: when it ends, a
 * date to move that to, and a way to come back early. The rules — at most
 * `maxDays`, days already taken stay taken — are the server's
 * (`plan_vacation` in backend/tracking/xp.py); a refusal comes back as a
 * sentence and is shown as one.
 */
import { useState } from 'react';
import { settings as service } from '@/services';
import { addDays, fromIsoDate, isoDate } from '@/utils/dates';
import type { UserStats, VacationWindow } from '@/types';

function spoken(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

type Measure = 'days' | 'until';

export function VacationMode({
  vacation,
  maxDays,
  onChanged,
}: {
  vacation: VacationWindow | null;
  maxDays: number;
  /** The stats the server answered with, and a line for the page to flash. */
  onChanged: (stats: UserStats, message: string) => void;
}) {
  const today = new Date();
  const todayIso = isoDate(today);
  const [measure, setMeasure] = useState<Measure>('days');
  const [days, setDays] = useState(7);
  const [until, setUntil] = useState(isoDate(addDays(today, 6)));
  const [moveTo, setMoveTo] = useState(vacation?.end ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* The last day away, whichever way it was asked for. `days` counts today,
     so a week is today and the six after it. */
  const lastDay = measure === 'days' ? isoDate(addDays(today, Math.max(1, days) - 1)) : until;
  const latest = (start: string) => isoDate(addDays(fromIsoDate(start), maxDays - 1));

  async function run(
    call: () => ReturnType<typeof service.planVacation>,
    message: (stats: UserStats) => string,
  ) {
    setBusy(true);
    setProblem(null);
    const result = await call();
    setBusy(false);
    if (!result.success) {
      setProblem(result.message);
      return;
    }
    if (result.stats.vacation) setMoveTo(result.stats.vacation.end);
    onChanged(result.stats, message(result.stats));
  }

  if (vacation) {
    return (
      <div className="st-vacation">
        <p className="st-vacation-now">
          {vacation.active
            ? `On vacation until ${spoken(vacation.end)}`
            : `Away from ${spoken(vacation.start)} to ${spoken(vacation.end)}`}
        </p>
        <div className="st-vacation-line">
          <label className="st-vacation-field">
            <span>Ends</span>
            <input
              type="date"
              className="st-input"
              value={moveTo}
              min={todayIso}
              max={latest(vacation.start)}
              disabled={busy}
              onChange={(event) => setMoveTo(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="st-btn"
            disabled={busy || !moveTo || moveTo === vacation.end}
            onClick={() =>
              void run(() => service.planVacation(moveTo), () => `Vacation now ends ${spoken(moveTo)}`)
            }
          >
            Change
          </button>
          <button
            type="button"
            className="st-btn"
            disabled={busy}
            onClick={() => void run(service.endVacation, () => 'Welcome back — today counts again')}
          >
            End vacation
          </button>
        </div>
        {problem && <p className="st-vacation-problem" role="alert">{problem}</p>}
      </div>
    );
  }

  return (
    <div className="st-vacation">
      <div className="st-seg" role="group" aria-label="How long">
        {(
          [
            ['days', 'Number of days'],
            ['until', 'Until a date'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`st-pick${measure === key ? ' is-on' : ''}`}
            aria-pressed={measure === key}
            disabled={busy}
            onClick={() => setMeasure(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="st-vacation-line">
        {measure === 'days' ? (
          <label className="st-vacation-field">
            <input
              type="number"
              className="st-input is-num"
              min={1}
              max={maxDays}
              value={days}
              disabled={busy}
              aria-label="Days away"
              onChange={(event) => setDays(Math.min(maxDays, Math.max(1, Number(event.target.value) || 1)))}
            />
            <span>{days === 1 ? 'day' : 'days'}</span>
          </label>
        ) : (
          <label className="st-vacation-field">
            <span>Last day away</span>
            <input
              type="date"
              className="st-input"
              value={until}
              min={todayIso}
              max={latest(todayIso)}
              disabled={busy}
              onChange={(event) => setUntil(event.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          className="st-btn"
          disabled={busy || !lastDay}
          onClick={() =>
            void run(() => service.planVacation(lastDay), () => `On vacation until ${spoken(lastDay)}`)
          }
        >
          Start vacation
        </button>
      </div>
      {lastDay && <p className="st-quiet st-vacation-through">Today through {spoken(lastDay)}</p>}
      {problem && <p className="st-vacation-problem" role="alert">{problem}</p>}
    </div>
  );
}
